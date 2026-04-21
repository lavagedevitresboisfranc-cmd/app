// @ts-nocheck
import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="fr-CA" style={{ height: "100%" }}>
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover"
        />

        {/* --- PWA --- */}
        <title>CrystalTask</title>
        <meta name="description" content="Gestion de rendez-vous et CRM pour entreprises de lavage de vitres" />
        <meta name="theme-color" content="#0891B2" />
        <meta name="color-scheme" content="light" />
        <link rel="manifest" href="/manifest.webmanifest" />

        {/* Favicons */}
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16.png" />

        {/* Apple (iOS + Safari Dock sur macOS) */}
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <link rel="apple-touch-icon-precomposed" href="/apple-touch-icon-precomposed.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="CrystalTask" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="application-name" content="CrystalTask" />

        {/* Microsoft tile */}
        <meta name="msapplication-TileColor" content="#0891B2" />
        <meta name="msapplication-TileImage" content="/icon-144.png" />

        {/* Open Graph (partage) */}
        <meta property="og:type" content="website" />
        <meta property="og:title" content="CrystalTask" />
        <meta property="og:description" content="Gestion de rendez-vous et CRM" />
        <meta property="og:image" content="/icon-512.png" />
        {/* --- /PWA --- */}

        <ScrollViewStyleReset />
        <style
          dangerouslySetInnerHTML={{
            __html: `
              body > div:first-child { position: fixed !important; top: 0; left: 0; right: 0; bottom: 0; }
              [role="tablist"] [role="tab"] * { overflow: visible !important; }
              [role="heading"], [role="heading"] * { overflow: visible !important; }
            `,
          }}
        />
      </head>
      <body
        style={{
          margin: 0,
          height: "100%",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {children}
      </body>
    </html>
  );
}
