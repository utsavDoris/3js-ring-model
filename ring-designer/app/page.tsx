"use client";

import { useState, useEffect, useRef } from "react";

// Define Types
type RingStyle =
  | "Solitaire Shank"
  | "3-row Pave Diamond"
  | "Double Row Diamond"
  | "Split"
  | "Garden"
  | "Single Row Diamond"
  | "Twist";
type SettingStyle = "Hidden Halo" | "Basket Set";
type DiamondShape =
  | "Asscher"
  | "Heart"
  | "Oval"
  | "Cushion"
  | "Emerald"
  | "Marquise"
  | "Pear"
  | "Princess"
  | "Radiant"
  | "Round";
type Carat = number;

// Configuration Options as Array of Objects
const RING_STYLE_OPTIONS = [
  { label: "Solitaire Shank", value: "Solitaire Shank" as RingStyle },
  { label: "3-row Pave Diamond", value: "3-row Pave Diamond" as RingStyle },
  { label: "Double Row Diamond", value: "Double Row Diamond" as RingStyle },
  { label: "Split", value: "Split" as RingStyle },
  { label: "Garden", value: "Garden" as RingStyle },
  { label: "Single Row Diamond", value: "Single Row Diamond" as RingStyle },
  { label: "Twist", value: "Twist" as RingStyle },
];

const SETTING_STYLE_OPTIONS = [
  { label: "Hidden Halo", value: "Hidden Halo" as SettingStyle },
  { label: "Basket Set", value: "Basket Set" as SettingStyle },
];

const DIAMOND_SHAPE_OPTIONS = [
  { label: "Asscher", value: "Asscher" as DiamondShape },
  { label: "Heart", value: "Heart" as DiamondShape },
  { label: "Oval", value: "Oval" as DiamondShape },
  { label: "Cushion", value: "Cushion" as DiamondShape },
  { label: "Emerald", value: "Emerald" as DiamondShape },
  { label: "Marquise", value: "Marquise" as DiamondShape },
  { label: "Pear", value: "Pear" as DiamondShape },
  { label: "Princess", value: "Princess" as DiamondShape },
  { label: "Radiant", value: "Radiant" as DiamondShape },
  { label: "Round", value: "Round" as DiamondShape },
];

const CARAT_OPTIONS = [
  { label: "1 ct", value: 1 },
  { label: "1.5 ct", value: 1.5 },
  { label: "2 ct", value: 2 },
  { label: "2.5 ct", value: 2.5 },
  { label: "3 ct", value: 3 },
  { label: "3.5 ct", value: 3.5 },
  { label: "4 ct", value: 4 },
];

const MATCHING_BAND_OPTIONS = [
  { label: "None", value: 0 },
  { label: "Band 1", value: 1 },
  { label: "Band 2", value: 2 },
];

// --- Ring Style Configuration ---
const RING_STYLE_CONFIG: Record<
  RingStyle,
  {
    allowedSettings: SettingStyle[];
    allowedShapes: DiamondShape[];
  }
> = {
  "Solitaire Shank": {
    allowedSettings: ["Hidden Halo", "Basket Set"],
    allowedShapes: [
      "Round",
      "Oval",
      "Cushion",
      "Emerald",
      "Princess",
      "Pear",
      "Radiant",
      "Marquise",
      "Asscher",
      "Heart",
    ],
  },
  "3-row Pave Diamond": {
    allowedSettings: ["Hidden Halo", "Basket Set"],
    allowedShapes: [
      "Round",
      "Oval",
      "Cushion",
      "Emerald",
      "Princess",
      "Pear",
      "Radiant",
      "Marquise",
      "Asscher",
      "Heart",
    ],
  },
  "Double Row Diamond": {
    allowedSettings: ["Hidden Halo", "Basket Set"],
    allowedShapes: [
      "Round",
      "Oval",
      "Cushion",
      "Emerald",
      "Princess",
      "Pear",
      "Radiant",
      "Marquise",
      "Asscher",
      "Heart",
    ],
  },
  Split: {
    allowedSettings: ["Hidden Halo", "Basket Set"],
    allowedShapes: [
      "Round",
      "Oval",
      "Cushion",
      "Emerald",
      "Princess",
      "Pear",
      "Radiant",
      "Marquise",
      "Asscher",
      "Heart",
    ],
  },
  Garden: {
    allowedSettings: ["Hidden Halo", "Basket Set"],
    allowedShapes: [
      "Round",
      "Oval",
      "Cushion",
      "Emerald",
      "Princess",
      "Pear",
      "Radiant",
      "Marquise",
      "Asscher",
      "Heart",
    ],
  },
  "Single Row Diamond": {
    allowedSettings: ["Hidden Halo", "Basket Set"],
    allowedShapes: [
      "Round",
      "Oval",
      "Cushion",
      "Emerald",
      "Princess",
      "Pear",
      "Radiant",
      "Marquise",
      "Asscher",
      "Heart",
    ],
  },
  Twist: {
    allowedSettings: ["Hidden Halo", "Basket Set"],
    allowedShapes: [
      "Round",
      "Oval",
      "Cushion",
      "Emerald",
      "Princess",
      "Pear",
      "Radiant",
      "Marquise",
      "Asscher",
      "Heart",
    ],
  },
};

import {
  SHANK_DATA,
  HEAD_DATA,
  DEFAULT_SHANK_URL,
  DEFAULT_HEAD_URL,
} from "./ring-data";

// Helper functions to get URLs based on selection
const getShankUrl = (ringStyle: RingStyle): string => {
  const match = SHANK_DATA.find((item) => item.style === ringStyle);
  return match ? match.url : DEFAULT_SHANK_URL;
};

// Check if a specific combination exists in the valid data matches both the CONFIG and the HEAD_DATA
const isCombinationAvailable = (
  ring: RingStyle,
  setting: SettingStyle,
  shape: DiamondShape,
): boolean => {
  // 1. Check if allowed by Ring Style Config
  const config = RING_STYLE_CONFIG[ring];
  if (
    !config.allowedSettings.includes(setting) ||
    !config.allowedShapes.includes(shape)
  ) {
    return false;
  }

  // 2. Check if a model exists in HEAD_DATA
  return HEAD_DATA.some(
    (item) => item.setting === setting && item.shape === shape,
  );
};

const getHeadUrl = (setting: SettingStyle, shape: DiamondShape): string => {
  const match = HEAD_DATA.find(
    (item) => item.setting === setting && item.shape === shape,
  );

  if (match) {
    return match.url;
  }

  return DEFAULT_HEAD_URL;
};

type MetalColor = "white" | "rose" | "yellow";

const METAL_COLOR_OPTIONS = [
  { label: "White Gold", value: "white" as MetalColor },
  { label: "Rose Gold", value: "rose" as MetalColor },
  { label: "Yellow Gold", value: "yellow" as MetalColor },
];

export default function RingBuilder() {
  const [ringStyle, setRingStyle] = useState<RingStyle>(
    RING_STYLE_OPTIONS[0].value,
  );
  const [settingStyle, setSettingStyle] = useState<SettingStyle>(
    SETTING_STYLE_OPTIONS[0].value,
  );
  const [diamondShape, setDiamondShape] = useState<DiamondShape>(
    DIAMOND_SHAPE_OPTIONS[0].value,
  );
  const [metalColor, setMetalColor] = useState<MetalColor>(
    METAL_COLOR_OPTIONS[0].value,
  );
  const [carat, setCarat] = useState<Carat>(CARAT_OPTIONS[0].value);
  const [matchingBand, setMatchingBand] = useState(
    MATCHING_BAND_OPTIONS[0].value,
  );
  const [twoTone, setTwoTone] = useState(false);
  const [autoRotate, setAutoRotate] = useState(false);
  const [iframeUrl, setIframeUrl] = useState("");

  // Validate Selections Effect
  useEffect(() => {
    const config = RING_STYLE_CONFIG[ringStyle];

    // 1. Validate Setting Style
    let currentSetting = settingStyle;
    if (!config.allowedSettings.includes(currentSetting)) {
      const nextSetting = config.allowedSettings[0];
      if (nextSetting) {
        setSettingStyle(nextSetting);
        currentSetting = nextSetting;
      }
    }

    // 2. Validate Diamond Shape
    const isShapeAllowedByRing = config.allowedShapes.includes(diamondShape);
    const isShapeInData = HEAD_DATA.some(
      (item) => item.setting === currentSetting && item.shape === diamondShape,
    );

    if (!isShapeAllowedByRing || !isShapeInData) {
      const validShapeOption = DIAMOND_SHAPE_OPTIONS.find((opt) => {
        const allowedByRing = config.allowedShapes.includes(opt.value);
        const existsInData = HEAD_DATA.some(
          (item) => item.setting === currentSetting && item.shape === opt.value,
        );
        return allowedByRing && existsInData;
      });

      if (validShapeOption) {
        setDiamondShape(validShapeOption.value);
      }
    }
  }, [ringStyle, settingStyle, diamondShape]);

  // Auto-disable two-tone when white gold is selected
  useEffect(() => {
    if (metalColor === "white" && twoTone) {
      setTwoTone(false);
    }
  }, [metalColor, twoTone]);

  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Update effect
  useEffect(() => {
    // const baseUrl = "https://3d-ring-builder.vercel.app/";
    const baseUrl = "http://localhost:5173/";

    const shankUrl = getShankUrl(ringStyle);
    const headUrl = getHeadUrl(settingStyle, diamondShape);

    if (!iframeUrl) {
      const metalParam = encodeURIComponent(metalColor);
      setIframeUrl(
        `${baseUrl}?shank=${shankUrl}&head=${headUrl}&metalColor=${metalParam}&carat=${carat}&matchingBand=${matchingBand}&twoTone=${twoTone}&autoRotate=${autoRotate}`,
      );
    } else {
      // Send post message for instant updates
      if (iframeRef.current && iframeRef.current.contentWindow) {
        iframeRef.current.contentWindow.postMessage(
          {
            type: "UPDATE_CONFIGURATION",
            payload: {
              shank: shankUrl,
              head: headUrl,
              metalColor,
              carat,
              matchingBand,
              twoTone,
              autoRotate,
            },
          },
          "*",
        );
      }
    }
  }, [
    ringStyle,
    settingStyle,
    diamondShape,
    metalColor,
    carat,
    matchingBand,
    twoTone,
    autoRotate,
    iframeUrl,
  ]);

  return (
    <div className="flex h-screen w-screen flex-col md:flex-row overflow-hidden bg-[#f8f9fa]">
      {/* Left Side: 3D Viewer */}
      <main className="flex-1 relative bg-[#eef0f2] h-[50vh] md:h-auto">
        <div className="absolute top-6 right-6 z-20 flex flex-col gap-4 items-end">
          {/* Auto Rotate Toggle Button */}
          <button
            onClick={() => setAutoRotate(!autoRotate)}
            className={`backdrop-blur-sm px-4 py-2 rounded-full shadow-lg transition-all duration-300 flex items-center gap-2 group hover:scale-105 ${
              autoRotate
                ? "bg-accent text-white hover:bg-[#a68b4f]"
                : "bg-white/90 text-gray-500 hover:text-accent hover:bg-white"
            }`}
            title={autoRotate ? "Disable Auto Rotate" : "Enable Auto Rotate"}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={autoRotate ? "animate-spin" : ""}
              style={autoRotate ? { animationDuration: "3s" } : {}}
            >
              <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
            </svg>
            <span className="text-xs font-semibold tracking-widest">
              {autoRotate ? "ROTATING" : "AUTO ROTATE"}
            </span>
          </button>

          {/* Reset Button Overlay */}
          <button
            onClick={() => {
              // 1. Reset Ring Style to first option
              const defaultRing = RING_STYLE_OPTIONS[0].value;
              setRingStyle(defaultRing);

              const config = RING_STYLE_CONFIG[defaultRing];

              // 2. Find first enabled Setting Style for this ring
              const defaultSettingOpt = SETTING_STYLE_OPTIONS.find((opt) =>
                config.allowedSettings.includes(opt.value),
              );
              const defaultSetting =
                defaultSettingOpt?.value || SETTING_STYLE_OPTIONS[0].value;
              setSettingStyle(defaultSetting);

              // 3. Find first enabled Diamond Shape (Layout order) for this ring + setting
              const defaultShapeOpt = DIAMOND_SHAPE_OPTIONS.find((opt) => {
                const allowedByRing = config.allowedShapes.includes(opt.value);
                const existsInData = HEAD_DATA.some(
                  (item) =>
                    item.setting === defaultSetting && item.shape === opt.value,
                );
                return allowedByRing && existsInData;
              });
              const defaultShape =
                defaultShapeOpt?.value || DIAMOND_SHAPE_OPTIONS[0].value;
              setDiamondShape(defaultShape);

              // 4. Reset others to first option
              setMetalColor(METAL_COLOR_OPTIONS[0].value);
              setCarat(CARAT_OPTIONS[0].value);
              setMatchingBand(MATCHING_BAND_OPTIONS[0].value);
              setTwoTone(false);
              setAutoRotate(false);
            }}
            className="bg-white/90 backdrop-blur-sm px-4 py-2 rounded-full shadow-lg text-gray-500 hover:text-accent hover:bg-white transition-all duration-300 flex items-center gap-2 group hover:scale-105"
            title="Reset Configuration"
          >
            <span className="text-xs font-semibold tracking-widest">RESET</span>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="group-hover:rotate-180 transition-transform duration-500"
            >
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
          </button>
        </div>

        {iframeUrl && (
          <iframe
            src={iframeUrl}
            ref={iframeRef}
            className="w-full h-[50vh] md:h-full border-none"
            allow="autoplay; fullscreen; vr"
          />
        )}
      </main>

      {/* Right Side: Controls */}
      <aside className="w-full md:w-[500px] bg-white flex flex-col z-10 shadow-xl overflow-y-auto p-8">
        <header className="mb-8">
          <h1 className="text-2xl lg:text-3xl font-medium text-primary mb-2 tracking-tight">
            Design Your Dream Ring
          </h1>
          <p className="text-gray-500 font-light text-sm">
            Customize every detail to match your perfect style.
          </p>
        </header>

        <div className="space-y-8 flex-1">
          {/* Ring Style */}
          <Section label="Ring Style">
            <OptionCarousel selected={ringStyle}>
              {RING_STYLE_OPTIONS.map((option) => (
                <OptionButton
                  key={option.value}
                  label={option.label}
                  active={ringStyle === option.value}
                  onClick={() => setRingStyle(option.value)}
                />
              ))}
            </OptionCarousel>
          </Section>

          {/* Setting Style */}
          <Section label="Setting Style">
            <OptionCarousel selected={settingStyle}>
              {SETTING_STYLE_OPTIONS.map((option) => {
                const config = RING_STYLE_CONFIG[ringStyle];
                const disabled = !config.allowedSettings.includes(option.value);

                return (
                  <OptionButton
                    key={option.value}
                    label={option.label}
                    active={settingStyle === option.value}
                    onClick={() => setSettingStyle(option.value)}
                    disabled={disabled}
                  />
                );
              })}
            </OptionCarousel>
          </Section>

          {/* Diamond Shape */}
          <Section label="Diamond Shape">
            <OptionCarousel selected={diamondShape}>
              {DIAMOND_SHAPE_OPTIONS.map((option) => {
                const available = isCombinationAvailable(
                  ringStyle,
                  settingStyle,
                  option.value,
                );
                return (
                  <OptionButton
                    key={option.value}
                    label={option.label}
                    active={diamondShape === option.value}
                    onClick={() => setDiamondShape(option.value)}
                    disabled={!available}
                  />
                );
              })}
            </OptionCarousel>
          </Section>

          {/* Metal Color */}
          <Section label="Metal Color">
            <div className="flex flex-col gap-4">
              <OptionCarousel selected={metalColor}>
                {METAL_COLOR_OPTIONS.map((option) => (
                  <OptionButton
                    key={option.value}
                    label={option.label}
                    active={metalColor === option.value}
                    onClick={() => setMetalColor(option.value)}
                    className="min-w-[120px]"
                  />
                ))}
              </OptionCarousel>

              {metalColor !== "white" && (
                <div
                  onClick={() => setTwoTone(!twoTone)}
                  className={`
                  flex items-center justify-between px-4 py-3 rounded-xl border cursor-pointer transition-all duration-200 group
                  ${
                    twoTone
                      ? "border-accent bg-[#fffbf0] shadow-[0_0_0_1px_var(--accent)]"
                      : "border-gray-200 bg-white hover:border-accent hover:shadow-sm"
                  }
                `}
                >
                  <div className="flex flex-col">
                    <span
                      className={`text-sm font-medium ${twoTone ? "text-primary" : "text-gray-700"}`}
                    >
                      Two-Tone Head
                    </span>
                    <span className="text-xs text-gray-400 font-light">
                      White gold prongs
                    </span>
                  </div>
                  <div
                    className={`
                    relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none
                    ${twoTone ? "bg-accent" : "bg-gray-200"}
                  `}
                  >
                    <span
                      className={`
                      pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out
                      ${twoTone ? "translate-x-4" : "translate-x-0"}
                    `}
                    />
                  </div>
                </div>
              )}
            </div>
          </Section>

          {/* Carat */}
          <Section label="Carat">
            <OptionCarousel selected={carat}>
              {CARAT_OPTIONS.map((option) => (
                <OptionButton
                  key={option.value}
                  label={option.label}
                  active={carat === option.value}
                  onClick={() => setCarat(option.value)}
                  className="rounded-full min-w-[80px]"
                />
              ))}
            </OptionCarousel>
          </Section>

          {/* Matching Band */}
          <Section label="Matching Band">
            <OptionCarousel selected={matchingBand}>
              {MATCHING_BAND_OPTIONS.map((option) => (
                <OptionButton
                  key={option.value}
                  label={option.label}
                  active={matchingBand === option.value}
                  onClick={() => setMatchingBand(option.value)}
                  className="min-w-[80px]"
                />
              ))}
            </OptionCarousel>
          </Section>
        </div>

        {/* Footer/Action (Optional) */}
        <div className="mt-8 pt-6 border-t border-gray-100">
          <button className="w-full py-4 bg-accent text-white font-medium rounded-lg hover:bg-[#a68b4f] transition-colors shadow-lg shadow-yellow-900/10">
            Complete Design
          </button>
        </div>
      </aside>
    </div>
  );
}

// Sub-components
function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="text-xs uppercase tracking-widest font-bold text-gray-400 mb-3">
        {label}
      </h3>
      {children}
    </div>
  );
}

function OptionCarousel({
  children,
  className = "",
  selected,
}: {
  children: React.ReactNode;
  className?: string;
  selected?: any;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Scroll to selected item when it changes
  useEffect(() => {
    if (scrollRef.current) {
      // Find the active button (it has the specific active background/border classes)
      // We look for the button with 'border-accent' as defined in OptionButton
      const activeButton = scrollRef.current.querySelector(
        ".border-accent",
      ) as HTMLElement;

      if (activeButton) {
        // Calculate position to center or align the button
        const container = scrollRef.current;
        const scrollLeft =
          activeButton.offsetLeft -
          container.offsetLeft -
          container.clientWidth / 2 +
          activeButton.clientWidth / 2;

        container.scrollTo({
          left: Math.max(0, scrollLeft),
          behavior: "smooth",
        });
      }
    }
  }, [selected]);

  const scroll = (offset: number) => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: offset, behavior: "smooth" });
    }
  };

  return (
    <div className={`relative group/carousel ${className}`}>
      <button
        onClick={() => scroll(-200)}
        className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-2 z-10 w-8 h-8 bg-white border border-gray-100 rounded-full shadow-lg flex items-center justify-center text-gray-600 opacity-0 group-hover/carousel:opacity-100 transition-all hover:bg-gray-50 focus:outline-none hover:scale-110"
        aria-label="Scroll left"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m15 18-6-6 6-6" />
        </svg>
      </button>

      <div
        ref={scrollRef}
        className="flex overflow-x-auto gap-3 py-2 px-1 scrollbar-hide snap-x"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {children}
      </div>

      <button
        onClick={() => scroll(200)}
        className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-3 z-10 w-8 h-8 bg-white border border-gray-100 rounded-full shadow-lg flex items-center justify-center text-gray-600 opacity-0 group-hover/carousel:opacity-100 transition-all hover:bg-gray-50 focus:outline-none hover:scale-110"
        aria-label="Scroll right"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m9 18 6-6-6-6" />
        </svg>
      </button>
    </div>
  );
}

function OptionButton({
  label,
  active,
  onClick,
  className = "",
  disabled = false,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        px-6 py-3 text-sm border rounded-xl transition-all duration-200 flex items-center justify-center text-center flex-shrink-0 whitespace-nowrap snap-center
        ${
          active
            ? "border-accent bg-[#fffbf0] text-primary font-medium shadow-[0_0_0_1px_var(--accent)]"
            : "border-gray-200 bg-white text-gray-700 hover:border-accent hover:shadow-sm hover:-translate-y-0.5"
        }
        ${
          disabled
            ? "opacity-40 cursor-not-allowed hover:transform-none hover:shadow-none bg-gray-50 text-gray-300 border-gray-100"
            : ""
        }
        ${className}
      `}
    >
      {label}
    </button>
  );
}
