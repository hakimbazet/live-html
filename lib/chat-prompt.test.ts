import { describe, it, expect } from "vitest";
import { parseChatReply, FIX_SENTINEL, DATA_SENTINEL } from "./chat-prompt";

describe("parseChatReply", () => {
  it("returns prose only when no sentinel is present", () => {
    const r = parseChatReply("The spacing looks identical to me.");
    expect(r.reply).toBe("The spacing looks identical to me.");
    expect(r.proposedTemplate).toBeUndefined();
    expect(r.proposedData).toBeUndefined();
  });

  it("extracts a proposed template without data", () => {
    const r = parseChatReply(
      `I made the heading bold.\n${FIX_SENTINEL}\n<html><body>fixed</body></html>`
    );
    expect(r.reply).toBe("I made the heading bold.");
    expect(r.proposedTemplate).toBe("<html><body>fixed</body></html>");
    expect(r.proposedData).toBeUndefined();
  });

  it("extracts both a template and corrected data", () => {
    const r = parseChatReply(
      `Added a subtitle binding.\n${FIX_SENTINEL}\n<html>t</html>\n${DATA_SENTINEL}\n{"version":1}`
    );
    expect(r.reply).toBe("Added a subtitle binding.");
    expect(r.proposedTemplate).toBe("<html>t</html>");
    expect(r.proposedData).toBe('{"version":1}');
  });

  it("extracts data-only proposals (editor focus, no template)", () => {
    const r = parseChatReply(`Relabeled the KPI.\n${DATA_SENTINEL}\n{"version":1}`);
    expect(r.reply).toBe("Relabeled the KPI.");
    expect(r.proposedTemplate).toBeUndefined();
    expect(r.proposedData).toBe('{"version":1}');
  });

  it("strips markdown fences around the template and data", () => {
    const r = parseChatReply(
      `fix\n${FIX_SENTINEL}\n\`\`\`html\n<html>t</html>\n\`\`\`\n${DATA_SENTINEL}\n\`\`\`json\n{"version":1}\n\`\`\``
    );
    expect(r.proposedTemplate).toBe("<html>t</html>");
    expect(r.proposedData).toBe('{"version":1}');
  });
});
