"use client"

import { useRef, useState, useEffect } from "react"
import { FileCode2, AlertTriangle, Upload, Play, Copy } from "lucide-react"
import { usePipelineStore } from "@/src/store/usePipelineStore"
import { Button } from "@/components/ui/button"

function tokenize(line: string) {
  const tokens: { text: string; className: string }[] = []
  const patterns: [RegExp, string][] = [
    [/^(\/\/.*)/, "text-muted-foreground italic"],
    [/^(\/\/\/.*)/, "text-neon-green/50 italic"],
    [/^("(?:[^"\\]|\\.)*")/, "text-neon-amber"],
    [/^(\b(?:pragma|solidity|import|contract|is|using|for|function|public|view|override|returns|return|require|mapping|address|uint256|constant|constructor)\b)/, "text-neon-green"],
    [/^(\b(?:IERC20|ERC4626|ERC20|SafeERC20|VulnerableVault)\b)/, "text-[#00b0ff]"],
    [/^(\b(?:true|false)\b)/, "text-neon-amber"],
    [/^(\b\d+\b)/, "text-neon-amber"],
    [/^(@\w+(?:\/[^\s;]+)?)/, "text-[#00b0ff]"],
    [/^(\b(?:memory|calldata|storage|external|internal|private|virtual|pure)\b)/, "text-neon-green/70"],
  ]

  let remaining = line
  while (remaining.length > 0) {
    let matched = false
    for (const [pattern, className] of patterns) {
      const match = remaining.match(pattern)
      if (match) {
        tokens.push({ text: match[1], className })
        remaining = remaining.slice(match[1].length)
        matched = true
        break
      }
    }
    if (!matched) {
      const nextSpecial = remaining.slice(1).search(/[/"@a-zA-Z0-9]/)
      if (nextSpecial === -1) {
        tokens.push({ text: remaining, className: "text-foreground" })
        remaining = ""
      } else {
        tokens.push({ text: remaining.slice(0, nextSpecial + 1), className: "text-foreground" })
        remaining = remaining.slice(nextSpecial + 1)
      }
    }
  }
  return tokens
}

function validateSolidity(code: string): { valid: boolean; error?: string } {
  if (!code.trim()) {
    return { valid: false, error: "Code cannot be empty" }
  }
  if (!code.includes("pragma solidity")) {
    return { valid: false, error: "Missing pragma solidity directive" }
  }
  if (!code.includes("contract") && !code.includes("library") && !code.includes("interface")) {
    return { valid: false, error: "No contract, library, or interface found" }
  }
  return { valid: true }
}

export function CodeEditor() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [localCode, setLocalCode] = useState("")
  const [cursorPosition, setCursorPosition] = useState({ line: 1, col: 1 })
  const [showValidationError, setShowValidationError] = useState(false)

  const {
    originalCode,
    contractFileName,
    vulnerabilities,
    isScanning,
    setCode,
    startAnalysis,
  } = usePipelineStore()

  // Initialize with store code or default
  useEffect(() => {
    if (originalCode) {
      setLocalCode(originalCode)
    } else {
      // Default example code
      const defaultCode = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract Example {
    function hello() public pure returns (string memory) {
        return "Hello, World!";
    }
}`
      setLocalCode(defaultCode)
      setCode(defaultCode, "Example.sol")
    }
  }, [originalCode, setCode])

  // Update cursor position helper
  const updateCursorPosition = (textarea: HTMLTextAreaElement) => {
    const value = textarea.value
    const textBeforeCursor = value.substring(0, textarea.selectionStart)
    const lines = textBeforeCursor.split("\n")
    setCursorPosition({
      line: lines.length,
      col: lines[lines.length - 1].length + 1,
    })
  }

  // Update cursor position
  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    setLocalCode(value)
    updateCursorPosition(e.target)
  }

  // Handle cursor movement events for real-time updates
  const handleCursorMove = (e: React.MouseEvent<HTMLTextAreaElement> | React.KeyboardEvent<HTMLTextAreaElement>) => {
    updateCursorPosition(e.currentTarget)
  }

  // Handle copy
  const handleCopy = async () => {
    try {
      if (textareaRef.current) {
        const textarea = textareaRef.current
        textarea.focus() // Ensure textarea is focused for selection
        const selectedText = localCode.substring(textarea.selectionStart, textarea.selectionEnd)
        const textToCopy = selectedText || localCode
        
        // Use modern Clipboard API if available
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(textToCopy)
        } else {
          // Fallback for older browsers or non-HTTPS contexts
          const tempTextarea = document.createElement("textarea")
          tempTextarea.value = textToCopy
          tempTextarea.style.position = "fixed"
          tempTextarea.style.opacity = "0"
          document.body.appendChild(tempTextarea)
          tempTextarea.select()
          document.execCommand("copy")
          document.body.removeChild(tempTextarea)
        }
      }
    } catch (err) {
      console.error("Failed to copy to clipboard:", err)
    }
  }

  // Handle file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Only accept .sol files
    if (!file.name.endsWith(".sol")) {
      alert("Please upload a .sol file")
      return
    }

    const reader = new FileReader()
    reader.onload = (event) => {
      const content = event.target?.result as string
      setLocalCode(content)
      setCode(content, file.name)
    }
    reader.readAsText(file)
  }

  // Handle run analysis
  const handleRunAnalysis = async () => {
    const validation = validateSolidity(localCode)
    if (!validation.valid) {
      setShowValidationError(true)
      setTimeout(() => setShowValidationError(false), 3000)
      return
    }

    setCode(localCode, contractFileName)
    startAnalysis()

    // TODO: In Phase 2, this will call the API
    // For now, just update the step
  }

  // Get vulnerable lines from store
  const vulnerableLines = new Set<number>()
  vulnerabilities.forEach((vuln) => {
    vuln.locations.forEach((loc) => {
      for (let i = loc.line_start; i <= loc.line_end; i++) {
        vulnerableLines.add(i)
      }
    })
  })

  const codeLines = localCode.split("\n")

  return (
    <section
      className="flex h-full flex-col overflow-hidden rounded-lg border border-border bg-[#0d0d0d]"
      aria-label="Smart contract code editor"
    >
      {/* Title bar */}
      <div className="flex items-center justify-between border-b border-border bg-secondary/50 px-4 py-2">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <FileCode2 className="size-3.5 text-muted-foreground" aria-hidden="true" />
            <span className="text-xs text-muted-foreground font-mono">{contractFileName}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".sol"
            onChange={handleFileUpload}
            className="hidden"
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            className="h-7 text-xs"
          >
            <Upload className="size-3 mr-1" />
            Upload
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopy}
            className="h-7 text-xs"
          >
            <Copy className="size-3 mr-1" />
            Copy
          </Button>
          <Button
            size="sm"
            onClick={handleRunAnalysis}
            disabled={isScanning || !localCode.trim()}
            className="h-7 bg-neon-green/10 text-neon-green border border-neon-green/30 hover:bg-neon-green/20 hover:text-neon-green disabled:opacity-50"
          >
            <Play className="size-3 mr-1" />
            {isScanning ? "Analyzing..." : "Run Analysis"}
          </Button>
        </div>
      </div>

      {/* Code area */}
      <div className="flex-1 overflow-auto p-0 relative" role="code" aria-label="Solidity smart contract source code">
        {/* Syntax-highlighted preview */}
        <div className="absolute inset-0 pointer-events-none">
          <pre className="text-[13px] leading-6 font-mono p-0">
            {codeLines.map((line, i) => {
              const lineNum = i + 1
              const isVulnerable = vulnerableLines.has(lineNum)
              const tokens = tokenize(line)

              return (
                <div
                  key={lineNum}
                  className={`flex ${
                    isVulnerable
                      ? "bg-neon-red/10 border-l-2 border-neon-red"
                      : "border-l-2 border-transparent"
                  }`}
                >
                  <span
                    className={`inline-block w-12 shrink-0 select-none pr-4 text-right text-xs leading-6 ${
                      isVulnerable ? "text-neon-red" : "text-muted-foreground/50"
                    }`}
                    aria-hidden="true"
                  >
                    {lineNum}
                  </span>
                  <span className="flex-1 pr-4">
                    {isVulnerable && (
                      <AlertTriangle
                        className="inline-block size-3.5 text-neon-red mr-1 -mt-0.5"
                        aria-label="Vulnerability detected on this line"
                      />
                    )}
                    {tokens.map((token, j) => (
                      <span key={j} className={token.className}>
                        {token.text}
                      </span>
                    ))}
                  </span>
                </div>
              )
            })}
          </pre>
        </div>
        {/* Editable textarea */}
        <textarea
          ref={textareaRef}
          value={localCode}
          onChange={handleTextareaChange}
          onKeyUp={handleCursorMove}
          onMouseUp={handleCursorMove}
          onClick={handleCursorMove}
          onBlur={() => setCode(localCode, contractFileName)}
          className="absolute inset-0 w-full h-full bg-transparent text-transparent caret-neon-green font-mono text-[13px] leading-6 pl-[50px] pr-4 resize-none outline-none border-none"
          style={{
            fontFamily: "monospace",
            tabSize: 4,
          }}
          spellCheck={false}
          placeholder="Paste or upload your Solidity contract here..."
        />
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between border-t border-border bg-secondary/50 px-4 py-1 text-[11px] text-muted-foreground font-mono">
        <div className="flex items-center gap-3">
          <span>Solidity</span>
          <span>UTF-8</span>
        </div>
        <div className="flex items-center gap-3">
          {showValidationError && (
            <span className="text-neon-red">Please check your Solidity code</span>
          )}
          {vulnerabilities.length > 0 && (
            <span className="flex items-center gap-1">
              <AlertTriangle className="size-3 text-neon-red" aria-hidden="true" />
              <span className="text-neon-red">{vulnerabilities.length} vulnerability{vulnerabilities.length !== 1 ? "ies" : ""}</span>
            </span>
          )}
          <span>Ln {cursorPosition.line}, Col {cursorPosition.col}</span>
        </div>
      </div>
    </section>
  )
}
