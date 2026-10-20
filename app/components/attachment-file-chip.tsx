"use client";
import { useEffect, useState } from "react";
export function AttachmentFileChip({
  name,
  href,
  file,
  disabled,
  onRemove,
  title,
}: {
  name: string;
  href?: string;
  file?: File;
  disabled?: boolean;
  onRemove: () => void;
  title?: string;
}) {
  const [local, setLocal] = useState("");
  const raster =
    !!file && ["image/png", "image/jpeg", "image/webp"].includes(file.type);
  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(
      new Blob([file], {
        type: raster ? file.type : "application/octet-stream",
      }),
    );
    setLocal(url);
    return () => URL.revokeObjectURL(url);
  }, [file, raster]);
  return (
    <span className="attachment-file-chip" title={title ?? name}>
      {href || local ? (
        <a
          href={href ?? local}
          target="_blank"
          rel="noopener noreferrer"
          download={file && !raster ? name : undefined}
        >
          {name}
        </a>
      ) : (
        <span>{name}</span>
      )}
      <button
        type="button"
        disabled={disabled}
        aria-label={`Quitar ${name}`}
        title={`Quitar ${name}`}
        onClick={onRemove}
      >
        ×
      </button>
    </span>
  );
}
