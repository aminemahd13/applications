"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { QRCodeSVG } from "qrcode.react";
import type { CertificateLayout, CertificateTemplateElement } from "@/lib/certificates";
import {
  buildCertificateElementLabel,
  buildUploadedFontFamilyName,
  collectCertificateAssetUrls,
  collectCertificateFontAssetKeys,
  resolveCertificateAssetUrl,
} from "@/lib/certificate-document";

interface CertificateArtboardProps {
  layout: CertificateLayout;
  tokenValues: Record<string, string>;
  className?: string;
}

function toObjectFit(value: unknown): CSSProperties["objectFit"] {
  if (value === "cover" || value === "fill" || value === "contain") {
    return value;
  }
  return "contain";
}

function getTextJustify(value: unknown): CSSProperties["justifyContent"] {
  if (value === "center") return "center";
  if (value === "right") return "flex-end";
  return "flex-start";
}

function getTextAlign(value: unknown): CSSProperties["textAlign"] {
  if (value === "center" || value === "right") return value;
  return "left";
}

function getFiniteNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

function preloadImage(url: string): Promise<void> {
  return new Promise((resolve) => {
    if (!url) {
      resolve();
      return;
    }

    const image = new window.Image();
    image.crossOrigin = "anonymous";
    image.decoding = "async";
    image.onload = async () => {
      if (typeof image.decode === "function") {
        try {
          await image.decode();
        } catch {
          // continue with cached load event result
        }
      }
      resolve();
    };
    image.onerror = () => resolve();
    image.src = url;
  });
}

function buildTextValue(
  element: CertificateTemplateElement,
  tokenValues: Record<string, string>,
): string {
  if (element.type === "text") {
    return element.content ?? "";
  }
  if (element.type === "dynamic_text") {
    const tokenKey = (element.token ?? "").trim();
    return tokenKey ? tokenValues[tokenKey] || `{{${tokenKey}}}` : "{{token}}";
  }
  return "";
}

export function CertificateArtboard({
  layout,
  tokenValues,
  className,
}: CertificateArtboardProps) {
  const [fontFamilyByAssetKey, setFontFamilyByAssetKey] = useState<Record<string, string>>({});
  const [isReady, setIsReady] = useState(false);
  const requestIdRef = useRef(0);

  const assetUrls = useMemo(() => collectCertificateAssetUrls(layout), [layout]);
  const fontAssetKeys = useMemo(() => collectCertificateFontAssetKeys(layout), [layout]);

  useEffect(() => {
    let cancelled = false;

    Promise.all(
      fontAssetKeys.map(async (fontAssetKey) => {
        const familyName = buildUploadedFontFamilyName(fontAssetKey);
        if (document.fonts.check(`16px "${familyName}"`)) {
          return { fontAssetKey, familyName };
        }

        try {
          const fontFace = new FontFace(
            familyName,
            `url(${resolveCertificateAssetUrl(fontAssetKey)})`,
          );
          await fontFace.load();
          document.fonts.add(fontFace);
          return { fontAssetKey, familyName };
        } catch {
          return null;
        }
      }),
    ).then((rows) => {
      if (cancelled) return;
      setFontFamilyByAssetKey((previous) => {
        const next = { ...previous };
        for (const row of rows) {
          if (!row) continue;
          next[row.fontAssetKey] = row.familyName;
        }
        return next;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [fontAssetKeys]);

  useEffect(() => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setIsReady(false);

    let cancelled = false;

    Promise.allSettled([
      ...assetUrls.map((url) => preloadImage(url)),
      document.fonts.ready,
    ]).then(() => {
      if (cancelled) return;
      if (requestIdRef.current !== requestId) return;
      setIsReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, [assetUrls, fontFamilyByAssetKey, layout]);

  return (
    <div
      className={className}
      data-certificate-artboard="true"
      data-certificate-artboard-ready={isReady ? "true" : "false"}
      style={{
        position: "relative",
        overflow: "hidden",
        width: layout.canvas.width,
        height: layout.canvas.height,
        backgroundColor: layout.canvas.backgroundColor ?? "#ffffff",
        backgroundImage: layout.canvas.backgroundAssetKey
          ? `url(${resolveCertificateAssetUrl(layout.canvas.backgroundAssetKey)})`
          : undefined,
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        backgroundSize: "cover",
      }}
    >
      {layout.elements
        .slice()
        .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0))
        .map((element) => {
          const style = (element.style ?? {}) as Record<string, unknown>;
          const textAlign = getTextAlign(style.textAlign);
          const fontSize = getFiniteNumber(style.fontSize, 32);
          const fontWeight = getFiniteNumber(style.fontWeight, 500);
          const lineHeight = getFiniteNumber(style.lineHeight, 1.2);
          const letterSpacing = getFiniteNumber(style.letterSpacing, 0);
          const color =
            typeof style.color === "string" ? (style.color ?? "#0f172a") : "#0f172a";
          const opacity = Math.max(0, Math.min(1, getFiniteNumber(element.opacity, 1)));
          const rotation = getFiniteNumber(element.rotation, 0);
          const fontAssetKey =
            typeof style.fontAssetKey === "string"
              ? (style.fontAssetKey ?? "").trim()
              : "";
          const uploadedFontFamily = fontAssetKey ? fontFamilyByAssetKey[fontAssetKey] : undefined;
          const configuredFontFamily =
            typeof style.fontFamily === "string" ? style.fontFamily.trim() : "";
          const fontFamily = uploadedFontFamily
            ? configuredFontFamily
              ? `${uploadedFontFamily}, ${configuredFontFamily}`
              : uploadedFontFamily
            : configuredFontFamily || undefined;

          const frameStyle: CSSProperties = {
            position: "absolute",
            left: element.x,
            top: element.y,
            width: element.width,
            height: element.height,
            zIndex: element.zIndex ?? 0,
            opacity,
            transform: rotation ? `rotate(${rotation}deg)` : undefined,
            transformOrigin: "top left",
          };

          if (element.type === "image") {
            const assetUrl = resolveCertificateAssetUrl(element.assetKey);
            return (
              <div
                key={element.id}
                style={{
                  ...frameStyle,
                  overflow: "hidden",
                  borderRadius: getFiniteNumber(style.borderRadius, 0),
                }}
              >
                {assetUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={assetUrl}
                    alt={buildCertificateElementLabel(element)}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: toObjectFit(style.fit),
                    }}
                  />
                ) : null}
              </div>
            );
          }

          if (element.type === "signature") {
            const signatureSlot = layout.signatureSlots.find(
              (slot) => slot.key === element.signatureSlotKey,
            );
            const signatureUrl = resolveCertificateAssetUrl(signatureSlot?.assetKey);
            const signatureLabel =
              signatureSlot?.signerName ?? signatureSlot?.label ?? "Signature";

            return (
              <div
                key={element.id}
                style={{
                  ...frameStyle,
                  overflow: "hidden",
                  borderRadius: getFiniteNumber(style.borderRadius, 0),
                }}
              >
                {signatureUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={signatureUrl}
                    alt={buildCertificateElementLabel(element)}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: toObjectFit(style.fit),
                    }}
                  />
                ) : (
                  <div
                    dir="auto"
                    style={{
                      display: "flex",
                      width: "100%",
                      height: "100%",
                      alignItems: "flex-end",
                      justifyContent: "center",
                      padding: 4,
                      textAlign: "center",
                      color: "#64748b",
                      fontFamily,
                      fontSize,
                      fontWeight,
                      lineHeight,
                      letterSpacing,
                      whiteSpace: "pre-wrap",
                      overflowWrap: "anywhere",
                    }}
                  >
                    {signatureLabel}
                  </div>
                )}
              </div>
            );
          }

          if (element.type === "qr") {
            const tokenKey = (element.token ?? "").trim();
            const qrValue =
              (tokenKey ? tokenValues[tokenKey] : "") ||
              tokenValues.qrVerificationUrl ||
              tokenValues.verificationUrl ||
              tokenValues.verifiableCredentialUrl ||
              tokenValues.certificateUrl ||
              " ";
            const foregroundColor =
              typeof style.foregroundColor === "string"
                ? (style.foregroundColor ?? "#0f172a")
                : "#0f172a";
            const backgroundColor =
              typeof style.backgroundColor === "string"
                ? (style.backgroundColor ?? "#ffffff")
                : "#ffffff";

            return (
              <div
                key={element.id}
                style={{
                  ...frameStyle,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor,
                  padding: 8,
                }}
              >
                <QRCodeSVG
                  bgColor={backgroundColor}
                  fgColor={foregroundColor}
                  level="M"
                  size={Math.max(96, Math.min(element.width, element.height) - 16)}
                  value={qrValue}
                />
              </div>
            );
          }

          const textValue = buildTextValue(element, tokenValues);

          return (
            <div
              key={element.id}
              dir="auto"
              style={{
                ...frameStyle,
                color,
                fontSize,
                fontWeight,
                fontFamily,
                lineHeight,
                letterSpacing: `${letterSpacing}px`,
                textAlign,
                display: "flex",
                alignItems: "center",
                justifyContent: getTextJustify(textAlign),
                padding: 4,
                whiteSpace: "pre-wrap",
                overflowWrap: "anywhere",
              }}
            >
              {textValue}
            </div>
          );
        })}
    </div>
  );
}
