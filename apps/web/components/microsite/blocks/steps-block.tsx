import { Block } from "@event-platform/shared";
import { BlockSection } from "./block-section";

type StepItem = NonNullable<Extract<Block, { type: "STEPS" }>["data"]>["steps"][number];
type StepsData = Extract<Block, { type: "STEPS" }>["data"] & { heading?: string };

export function StepsBlock({ block }: { block: Extract<Block, { type: 'STEPS' }> }) {
  const data = (block.data || {}) as StepsData;
  const { title, steps = [] } = data;
  const heading = data.heading ?? title;

  if (steps.length === 0) return null;

  return (
    <>
      <div className="relative -mt-11 flex h-11 w-full justify-between">
        <div className="h-11 flex-auto bg-[var(--mm-dark)]" />
        <div className="microsite-shell flex justify-between">
          <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
            <polygon points="0,100 0,0 100,100" fill="var(--mm-dark)" />
            <polygon points="100,0 0,0 100,100" fill="#FFFFFF" />
          </svg>
          <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
            <polygon points="0,0 100,0 0,100" fill="#FFFFFF" />
            <polygon points="100,100 100,0 0,100" fill="var(--mm-dark)" />
          </svg>
        </div>
        <div className="h-11 flex-auto bg-[var(--mm-dark)]" />
      </div>

      <BlockSection
        block={block}
        defaults={{
          paddingY: "xl",
          paddingX: "lg",
          width: "wide",
          align: "center",
          backgroundClass: "bg-transparent",
        }}
        className="mm-dark-band"
      >
        {heading && (
          <h2 className="microsite-display mb-12 text-center text-3xl font-semibold text-white md:text-5xl">
            {heading}
          </h2>
        )}

        <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
          {steps.map((step: StepItem, idx: number) => (
            <div key={idx} className="mx-auto w-full max-w-sm text-center">
              <span className="inline-block rounded-full border border-white px-4 py-2 text-2xl">
                {idx + 1}
              </span>

              <div className="p-6 text-lg">
                {step.title}
              </div>

              {step.description && (
                <div className="p-6 text-sm text-zinc-200">
                  {step.description}
                </div>
              )}
            </div>
          ))}
        </div>
      </BlockSection>

      <div className="relative flex h-11 w-full justify-between">
        <div className="h-11 flex-auto bg-[var(--mm-dark)]" />
        <div className="microsite-shell flex justify-between">
          <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
            <polygon points="0,0 100,0 0,100" fill="var(--mm-dark)" />
            <polygon points="100,100 100,0 0,100" fill="#FFF" />
          </svg>
          <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
            <polygon points="0,100 0,0 100,100" fill="#FFF" />
            <polygon points="100,0 0,0 100,100" fill="var(--mm-dark)" />
          </svg>
        </div>
        <div className="h-11 flex-auto bg-[var(--mm-dark)]" />
      </div>
    </>
  );
}
