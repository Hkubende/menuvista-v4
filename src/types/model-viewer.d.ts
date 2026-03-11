import type * as React from "react";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "model-viewer": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      > & {
        src?: string;
        "camera-controls"?: string;
        "auto-rotate"?: string;
        "rotation-per-second"?: string;
        "shadow-intensity"?: string;
        "environment-image"?: string;
        exposure?: string;
        ar?: string;
        "ar-modes"?: string;
        "ar-placement"?: string;
      };
    }
  }
}
