"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Html5Qrcode, Html5QrcodeScannerState } from "html5-qrcode";
import { Camera, CameraOff, SwitchCamera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface QrScannerProps {
  /** Called when a QR code is successfully decoded */
  onScan: (decodedText: string) => void;
  /** Width of the scanning area in px (default 300) */
  width?: number;
  /** Height of the scanning area in px (default 300) */
  height?: number;
  /** Additional classes for the wrapper */
  className?: string;
  /** If true the scanner starts automatically */
  autoStart?: boolean;
  /** Disable the scanner (e.g. while a request is in-flight) */
  disabled?: boolean;
}

export function QrScanner({
  onScan,
  width = 300,
  height = 300,
  className,
  autoStart = false,
  disabled = false,
}: QrScannerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const lastScannedRef = useRef<string>("");
  const lastScannedTimeRef = useRef<number>(0);
  const disabledRef = useRef(disabled);
  const manualStopRef = useRef(false);

  useEffect(() => {
    disabledRef.current = disabled;
  }, [disabled]);

  const stopScanner = useCallback(async () => {
    const scanner = scannerRef.current;
    try {
      if (scanner) {
        const state = scanner.getState();
        if (
          state === Html5QrcodeScannerState.SCANNING ||
          state === Html5QrcodeScannerState.PAUSED
        ) {
          await scanner.stop();
        }
      }
    } catch {
      // ignore - scanner may already be stopped
    } finally {
      try {
        scanner?.clear();
      } catch {
        // ignore - clearing can fail if camera never started
      }
      scannerRef.current = null;
      setIsRunning(false);
    }
  }, []);

  const startScanner = useCallback(
    async (facing: "environment" | "user" = facingMode) => {
      setError(null);

      if (!containerRef.current) return;

      // Make sure previous instance is stopped
      await stopScanner();

      const id = "qr-scanner-region";

      // Clear leftover DOM from a previous run
      const el = document.getElementById(id);
      if (el) el.innerHTML = "";

      lastScannedRef.current = "";
      lastScannedTimeRef.current = 0;

      const scanner = new Html5Qrcode(id);
      scannerRef.current = scanner;

      try {
        await scanner.start(
          { facingMode: facing },
          {
            fps: 15,
            qrbox: {
              width: Math.min(width - 32, 280),
              height: Math.min(height - 32, 280),
            },
            aspectRatio: 1,
          },
          (decodedText) => {
            if (disabledRef.current) return;
            // Debounce duplicate scans briefly to avoid rapid re-fires
            const now = Date.now();
            if (
              decodedText === lastScannedRef.current &&
              now - lastScannedTimeRef.current < 1200
            ) {
              return;
            }
            lastScannedRef.current = decodedText;
            lastScannedTimeRef.current = now;
            onScan(decodedText);
          },
          // error callback – silence per-frame decode failures
          () => {}
        );
        setIsRunning(true);
      } catch (err: unknown) {
        const msg =
          err instanceof Error ? err.message : String(err);
        if (msg.includes("NotAllowedError") || msg.includes("Permission")) {
          setError("Camera permission denied. Please allow camera access and try again.");
        } else if (msg.includes("NotFoundError") || msg.includes("Requested device not found")) {
          setError("No camera found on this device.");
        } else {
          setError(`Unable to start camera: ${msg}`);
        }
        setIsRunning(false);
      }
    },
    [facingMode, height, onScan, stopScanner, width]
  );

  const toggleCamera = useCallback(async () => {
    const next = facingMode === "environment" ? "user" : "environment";
    setFacingMode(next);
    if (isRunning) {
      await startScanner(next);
    }
  }, [facingMode, isRunning, startScanner]);

  const handleStartClick = useCallback(async () => {
    manualStopRef.current = false;
    await startScanner();
  }, [startScanner]);

  const handleStopClick = useCallback(async () => {
    manualStopRef.current = true;
    await stopScanner();
  }, [stopScanner]);

  // Auto-start
  useEffect(() => {
    if (disabled && isRunning) {
      stopScanner();
      return;
    }
    if (autoStart && !disabled && !isRunning && !manualStopRef.current) {
      startScanner();
    }
  }, [autoStart, disabled, isRunning, startScanner, stopScanner]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopScanner();
    };
  }, [stopScanner]);

  return (
    <div className={cn("flex flex-col items-center gap-3", className)}>
      {/* Camera viewport */}
      <div
        ref={containerRef}
        className="relative overflow-hidden rounded-lg border bg-muted"
        style={{ width, height }}
      >
        <div id="qr-scanner-region" style={{ width: "100%", height: "100%" }} />

        {!isRunning && !error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground">
            <Camera className="h-10 w-10" />
            <span className="text-xs">Camera off</span>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-destructive p-4 text-center">
            <CameraOff className="h-10 w-10" />
            <span className="text-xs">{error}</span>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2">
        {!isRunning ? (
          <Button
            type="button"
            size="sm"
            onClick={handleStartClick}
            disabled={disabled}
          >
            <Camera className="h-4 w-4 mr-2" />
            Start Camera
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleStopClick}
          >
            <CameraOff className="h-4 w-4 mr-2" />
            Stop Camera
          </Button>
        )}

        {isRunning && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={toggleCamera}
            title="Switch between front and back camera"
          >
            <SwitchCamera className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
