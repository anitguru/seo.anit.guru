import { ImageResponse } from "next/og";

export const runtime = "edge";
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 6,
          backgroundColor: "#1e1e2e",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg width="22" height="22" viewBox="0 0 32 32" fill="none">
          <circle cx="13" cy="13" r="6" stroke="#89b4fa" strokeWidth="2.5"/>
          <line x1="17.5" y1="17.5" x2="24" y2="24" stroke="#89b4fa" strokeWidth="2.5" strokeLinecap="round"/>
          <polyline points="10,13 12,15 16,11" fill="none" stroke="#89b4fa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
    ),
    { ...size },
  );
}
