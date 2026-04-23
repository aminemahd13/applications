import { renderToStaticMarkup } from "react-dom/server";
import CertificateRenderPage from "./[token]/page";

describe("certificate render page", () => {
  it("renders the artboard-only surface without certificate chrome", async () => {
    const markup = renderToStaticMarkup(
      await CertificateRenderPage({
        params: Promise.resolve({ token: "token-1" }),
      }),
    );

    expect(markup).not.toContain("Completion Certificate");
    expect(markup).not.toContain("Verify");
    expect(markup).not.toContain("Open PDF");
  });
});
