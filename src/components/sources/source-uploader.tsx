"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Upload, Type, Loader2, FileText, File, FileImage, FileSpreadsheet, X } from "lucide-react";
import { toast } from "react-hot-toast";

interface SourceUploaderProps {
  onUploaded?: (filename: string) => void;
}

const ACCEPTED_TYPES = [
  // PDF
  ".pdf",
  // Word
  ".doc", ".docx",
  // PowerPoint
  ".ppt", ".pptx",
  // Excel
  ".xls", ".xlsx", ".csv",
  // Text
  ".md", ".txt", ".html", ".json",
  // Images
  ".jpg", ".jpeg", ".png", ".gif", ".bmp", ".tiff", ".webp", ".svg",
].join(",");

function getFileIcon(filename: string) {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  if (["pdf"].includes(ext)) return <File className="h-5 w-5 text-red-500" />;
  if (["doc", "docx", "odt", "rtf"].includes(ext)) return <FileText className="h-5 w-5 text-blue-500" />;
  if (["ppt", "pptx", "odp"].includes(ext)) return <FileText className="h-5 w-5 text-orange-500" />;
  if (["xls", "xlsx", "csv", "ods"].includes(ext)) return <FileSpreadsheet className="h-5 w-5 text-green-500" />;
  if (["jpg", "jpeg", "png", "gif", "bmp", "tiff", "webp", "svg"].includes(ext)) return <FileImage className="h-5 w-5 text-purple-500" />;
  return <FileText className="h-5 w-5 text-[var(--color-foreground-muted)]" />;
}

export function SourceUploader({ onUploaded }: SourceUploaderProps) {
  const [mode, setMode] = useState<"file" | "paste" | null>(null);
  const [pasteContent, setPasteContent] = useState("");
  const [pasteFilename, setPasteFilename] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const handleFileUpload = useCallback(
    async (files: FileList) => {
      setIsUploading(true);
      try {
        for (const file of Array.from(files)) {
          const formData = new FormData();
          formData.append("file", file);

          const res = await fetch("/api/sources", {
            method: "POST",
            body: formData,
          });

          if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || "Upload failed");
          }

          const data = await res.json();
          toast.success(data.message || `Uploaded: ${file.name}`, { duration: 5000 });
          onUploaded?.(data.filename);
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Upload failed");
      } finally {
        setIsUploading(false);
      }
    },
    [onUploaded]
  );

  const handlePasteSubmit = useCallback(async () => {
    if (!pasteContent.trim()) {
      toast.error("Content is required");
      return;
    }

    setIsUploading(true);
    try {
      const filename = pasteFilename.trim() || `paste-${Date.now()}.md`;
      const res = await fetch("/api/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename, content: pasteContent }),
      });

      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      toast.success(`Uploaded: ${data.filename}`);
      onUploaded?.(data.filename);
      setPasteContent("");
      setPasteFilename("");
      setMode(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setIsUploading(false);
    }
  }, [pasteContent, pasteFilename, onUploaded]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (e.dataTransfer.files.length > 0) {
        handleFileUpload(e.dataTransfer.files);
      }
    },
    [handleFileUpload]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  return (
    <div className="space-y-4">
      {!mode && (
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setMode("file")}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={`flex flex-col items-center gap-3 rounded-xl border-2 border-dashed p-8 transition-all cursor-pointer ${
              isDragging
                ? "border-[var(--color-primary)] bg-[var(--color-primary-light)]"
                : "border-[var(--color-border)] hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-light)]"
            }`}
          >
            <Upload className="h-8 w-8 text-[var(--color-primary)]" />
            <span className="text-sm font-semibold text-[var(--color-foreground)]">Upload File</span>
            <span className="text-xs text-[var(--color-foreground-muted)]">
              PDF, DOCX, PPTX, XLSX, images, markdown
            </span>
          </button>

          <button
            onClick={() => setMode("paste")}
            className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-[var(--color-border)] p-8 transition-all hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-light)] cursor-pointer"
          >
            <Type className="h-8 w-8 text-[var(--color-primary)]" />
            <span className="text-sm font-semibold text-[var(--color-foreground)]">Paste Text</span>
            <span className="text-xs text-[var(--color-foreground-muted)]">
              Paste content directly
            </span>
          </button>
        </div>
      )}

      {mode === "file" && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Upload File</h3>
              <Button variant="ghost" size="sm" onClick={() => setMode(null)}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div
              className={`flex flex-col items-center gap-3 rounded-lg border-2 border-dashed p-8 transition-all ${
                isDragging
                  ? "border-[var(--color-primary)] bg-[var(--color-primary-light)]"
                  : "border-[var(--color-border)] hover:border-[var(--color-primary)]"
              }`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
            >
              {isUploading ? (
                <>
                  <Loader2 className="h-8 w-8 animate-spin text-[var(--color-primary)]" />
                  <span className="text-sm text-[var(--color-foreground-muted)]">Parsing & uploading...</span>
                </>
              ) : (
                <>
                  <Upload className="h-8 w-8 text-[var(--color-primary)]" />
                  <span className="text-sm text-[var(--color-foreground-muted)]">
                    Drop files here or{" "}
                    <label className="text-[var(--color-primary)] cursor-pointer font-medium hover:underline">
                      browse
                      <input
                        type="file"
                        className="hidden"
                        multiple
                        accept={ACCEPTED_TYPES}
                        onChange={(e) => e.target.files && handleFileUpload(e.target.files)}
                      />
                    </label>
                  </span>
                  <p className="text-[10px] text-[var(--color-foreground-muted)] mt-1">
                    PDF · DOCX · PPTX · XLSX · CSV · Images · Markdown · TXT · HTML
                  </p>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {mode === "paste" && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Paste Content</h3>
              <Button variant="ghost" size="sm" onClick={() => setMode(null)}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
            <Input
              placeholder="Filename (e.g., my-article.md)"
              value={pasteFilename}
              onChange={(e) => setPasteFilename(e.target.value)}
            />
            <Textarea
              placeholder="Paste your content here..."
              value={pasteContent}
              onChange={(e) => setPasteContent(e.target.value)}
              rows={12}
              className="font-mono text-sm"
            />
            <Button
              onClick={handlePasteSubmit}
              disabled={isUploading || !pasteContent.trim()}
              className="w-full bg-[var(--color-primary)] text-[var(--color-on-primary)] hover:bg-[var(--color-primary-hover)]"
            >
              {isUploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Upload
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
