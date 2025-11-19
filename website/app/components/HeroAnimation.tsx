import Image from "next/image";

export default function HeroAnimation() {
  return (
    <div className="relative w-full h-full overflow-hidden">
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(ellipse_60%_60%_at_50%_50%,#000_70%,transparent_100%)]" />

      {/* SVG Layer */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="flowGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0" />
            <stop offset="50%" stopColor="#3b82f6" stopOpacity="1" />
            <stop offset="100%" stopColor="#06b6d4" stopOpacity="0" />
          </linearGradient>
          <linearGradient
            id="aiGradientTop"
            gradientUnits="userSpaceOnUse"
            x1="50"
            y1="25"
            x2="50"
            y2="50"
          >
            <stop offset="0%" stopColor="#a855f7" stopOpacity="0" />
            <stop offset="50%" stopColor="#a855f7" stopOpacity="1" />
            <stop offset="100%" stopColor="#a855f7" stopOpacity="0" />
          </linearGradient>
          <linearGradient
            id="aiGradientBottom"
            gradientUnits="userSpaceOnUse"
            x1="50"
            y1="50"
            x2="50"
            y2="75"
          >
            <stop offset="0%" stopColor="#a855f7" stopOpacity="0" />
            <stop offset="50%" stopColor="#a855f7" stopOpacity="1" />
            <stop offset="100%" stopColor="#a855f7" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Connection Lines */}
        {/* Left to Center */}
        <path
          d="M 15 20 C 30 20, 30 50, 50 50"
          stroke="url(#flowGradient)"
          strokeWidth="0.5"
          fill="none"
          className="opacity-20"
        />
        <path
          d="M 15 40 C 30 40, 30 50, 50 50"
          stroke="url(#flowGradient)"
          strokeWidth="0.5"
          fill="none"
          className="opacity-20"
        />
        <path
          d="M 15 60 C 30 60, 30 50, 50 50"
          stroke="url(#flowGradient)"
          strokeWidth="0.5"
          fill="none"
          className="opacity-20"
        />
        <path
          d="M 15 80 C 30 80, 30 50, 50 50"
          stroke="url(#flowGradient)"
          strokeWidth="0.5"
          fill="none"
          className="opacity-20"
        />

        {/* Center to Right */}
        <path
          d="M 50 50 C 70 50, 70 30, 85 30"
          stroke="url(#flowGradient)"
          strokeWidth="0.5"
          fill="none"
          className="opacity-20"
        />
        <path
          d="M 50 50 C 70 50, 70 50.1, 85 50"
          stroke="url(#flowGradient)"
          strokeWidth="0.5"
          fill="none"
          className="opacity-20"
        />
        <path
          d="M 50 50 C 70 50, 70 70, 85 70"
          stroke="url(#flowGradient)"
          strokeWidth="0.5"
          fill="none"
          className="opacity-20"
        />

        {/* Center to Top (OpenAI) */}
        <path
          d="M 50 50 L 50 25"
          stroke="url(#aiGradientTop)"
          strokeWidth="0.5"
          fill="none"
          className="opacity-20"
        />

        {/* Center to Bottom (User) */}
        <path
          d="M 50 75 L 50 50"
          stroke="url(#aiGradientBottom)"
          strokeWidth="0.5"
          fill="none"
          className="opacity-20"
        />

        {/* Animated Particles */}
        {/* Blue Particles */}
        <circle
          r="0.05"
          fill="none"
          stroke="white"
          strokeWidth="3"
          vectorEffect="non-scaling-stroke"
          style={{ filter: "drop-shadow(0 0 4px #3b82f6)" }}
        >
          <animateMotion
            dur="3s"
            repeatCount="indefinite"
            path="M 15 20 C 30 20, 30 50, 50 50"
            keyPoints="0;1"
            keyTimes="0;1"
            calcMode="linear"
          />
          <animate
            attributeName="opacity"
            values="0;1;0"
            dur="3s"
            repeatCount="indefinite"
          />
        </circle>
        <circle
          r="0.05"
          fill="none"
          stroke="white"
          strokeWidth="3"
          vectorEffect="non-scaling-stroke"
          style={{ filter: "drop-shadow(0 0 4px #3b82f6)" }}
        >
          <animateMotion
            dur="3s"
            begin="0.5s"
            repeatCount="indefinite"
            path="M 15 40 C 30 40, 30 50, 50 50"
            keyPoints="0;1"
            keyTimes="0;1"
            calcMode="linear"
          />
          <animate
            attributeName="opacity"
            values="0;1;0"
            dur="3s"
            begin="0.5s"
            repeatCount="indefinite"
          />
        </circle>
        <circle
          r="0.05"
          fill="none"
          stroke="white"
          strokeWidth="3"
          vectorEffect="non-scaling-stroke"
          style={{ filter: "drop-shadow(0 0 4px #3b82f6)" }}
        >
          <animateMotion
            dur="3s"
            begin="1s"
            repeatCount="indefinite"
            path="M 15 60 C 30 60, 30 50, 50 50"
            keyPoints="0;1"
            keyTimes="0;1"
            calcMode="linear"
          />
          <animate
            attributeName="opacity"
            values="0;1;0"
            dur="3s"
            begin="1s"
            repeatCount="indefinite"
          />
        </circle>
        <circle
          r="0.05"
          fill="none"
          stroke="white"
          strokeWidth="3"
          vectorEffect="non-scaling-stroke"
          style={{ filter: "drop-shadow(0 0 4px #3b82f6)" }}
        >
          <animateMotion
            dur="3s"
            begin="1.5s"
            repeatCount="indefinite"
            path="M 15 80 C 30 80, 30 50, 50 50"
            keyPoints="0;1"
            keyTimes="0;1"
            calcMode="linear"
          />
          <animate
            attributeName="opacity"
            values="0;1;0"
            dur="3s"
            begin="1.5s"
            repeatCount="indefinite"
          />
        </circle>

        {/* Outgoing Particles - Cyan */}
        <circle
          r="0.05"
          fill="none"
          stroke="white"
          strokeWidth="3"
          vectorEffect="non-scaling-stroke"
          style={{ filter: "drop-shadow(0 0 4px #06b6d4)" }}
        >
          <animateMotion
            dur="2s"
            begin="1s"
            repeatCount="indefinite"
            path="M 50 50 C 70 50, 70 30, 85 30"
            keyPoints="0;1"
            keyTimes="0;1"
            calcMode="linear"
          />
          <animate
            attributeName="opacity"
            values="1;0"
            dur="2s"
            begin="1s"
            repeatCount="indefinite"
          />
        </circle>
        <circle
          r="0.05"
          fill="none"
          stroke="white"
          strokeWidth="3"
          vectorEffect="non-scaling-stroke"
          style={{ filter: "drop-shadow(0 0 4px #06b6d4)" }}
        >
          <animateMotion
            dur="2s"
            begin="1.2s"
            repeatCount="indefinite"
            path="M 50 50 C 70 50, 70 50.1, 85 50"
            keyPoints="0;1"
            keyTimes="0;1"
            calcMode="linear"
          />
          <animate
            attributeName="opacity"
            values="1;0"
            dur="2s"
            begin="1.2s"
            repeatCount="indefinite"
          />
        </circle>
        <circle
          r="0.05"
          fill="none"
          stroke="white"
          strokeWidth="3"
          vectorEffect="non-scaling-stroke"
          style={{ filter: "drop-shadow(0 0 4px #06b6d4)" }}
        >
          <animateMotion
            dur="2s"
            begin="1.4s"
            repeatCount="indefinite"
            path="M 50 50 C 70 50, 70 70, 85 70"
            keyPoints="0;1"
            keyTimes="0;1"
            calcMode="linear"
          />
          <animate
            attributeName="opacity"
            values="1;0"
            dur="2s"
            begin="1.4s"
            repeatCount="indefinite"
          />
        </circle>

        {/* AI Interaction Particles - Purple */}
        {/* User Query: Bottom -> Center */}
        <circle
          r="0.05"
          fill="none"
          stroke="white"
          strokeWidth="3"
          vectorEffect="non-scaling-stroke"
          style={{ filter: "drop-shadow(0 0 4px #a855f7)" }}
        >
          <animateMotion
            dur="3s"
            repeatCount="indefinite"
            path="M 50 75 L 50 50"
            keyPoints="0;1"
            keyTimes="0;1"
            calcMode="linear"
          />
          <animate
            attributeName="opacity"
            values="0;1;0"
            dur="3s"
            repeatCount="indefinite"
          />
        </circle>

        {/* Agent -> OpenAI: Center -> Top */}
        <circle
          r="0.05"
          fill="none"
          stroke="white"
          strokeWidth="3"
          vectorEffect="non-scaling-stroke"
          style={{ filter: "drop-shadow(0 0 4px #a855f7)" }}
        >
          <animateMotion
            dur="2s"
            begin="1s"
            repeatCount="indefinite"
            path="M 50 50 L 50 25"
            keyPoints="0;1"
            keyTimes="0;1"
            calcMode="linear"
          />
          <animate
            attributeName="opacity"
            values="0;1;0"
            dur="2s"
            begin="1s"
            repeatCount="indefinite"
          />
        </circle>

        {/* OpenAI -> Agent: Top -> Center */}
        <circle
          r="0.05"
          fill="none"
          stroke="white"
          strokeWidth="3"
          vectorEffect="non-scaling-stroke"
          style={{ filter: "drop-shadow(0 0 4px #a855f7)" }}
        >
          <animateMotion
            dur="2s"
            begin="2s"
            repeatCount="indefinite"
            path="M 50 25 L 50 50"
            keyPoints="0;1"
            keyTimes="0;1"
            calcMode="linear"
          />
          <animate
            attributeName="opacity"
            values="0;1;0"
            dur="2s"
            begin="2s"
            repeatCount="indefinite"
          />
        </circle>

        {/* Agent -> User: Center -> Bottom */}
        <circle
          r="0.05"
          fill="none"
          stroke="white"
          strokeWidth="3"
          vectorEffect="non-scaling-stroke"
          style={{ filter: "drop-shadow(0 0 4px #a855f7)" }}
        >
          <animateMotion
            dur="3s"
            begin="3s"
            repeatCount="indefinite"
            path="M 50 50 L 50 75"
            keyPoints="0;1"
            keyTimes="0;1"
            calcMode="linear"
          />
          <animate
            attributeName="opacity"
            values="0;1;0"
            dur="3s"
            begin="3s"
            repeatCount="indefinite"
          />
        </circle>
      </svg>

      {/* Nodes */}
      <div className="absolute inset-0">
        <NodeIcon
          icon="/icons/stripe.svg"
          top="20%"
          left="15%"
          label="Stripe"
        />
        <NodeIcon
          icon="/icons/posthog.svg"
          top="40%"
          left="15%"
          label="PostHog"
        />
        <NodeIcon icon="/icons/close.svg" top="60%" left="15%" label="CRM" />
        <NodeIcon
          icon="/icons/google-analytics.svg"
          top="80%"
          left="15%"
          label="Analytics"
        />

        {/* Center Node */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20">
          <div className="absolute inset-0 bg-blue-500/20 rounded-full blur-2xl animate-pulse" />
          <div className="absolute inset-0 bg-white dark:bg-slate-900 rounded-full border border-blue-500/30 flex items-center justify-center shadow-[0_0_30px_rgba(59,130,246,0.3)] z-10">
            <MakoIcon className="w-12 h-16 dark:text-white mb-1" />
          </div>
        </div>

        <NodeIcon
          icon="/icons/openai.svg"
          top="15%"
          left="50%"
          label="AI Agents"
          align="bottom"
          invertDark
        />

        <NodeIcon
          icon="/icons/user.svg"
          top="85%"
          left="50%"
          label="You"
          align="bottom"
          invertDark
        />

        <NodeIcon
          icon="/icons/postgresql.svg"
          top="30%"
          left="85%"
          label="Postgres"
          align="right"
        />
        <NodeIcon
          icon="/icons/mongodb.svg"
          top="50%"
          left="85%"
          label="MongoDB"
          align="right"
        />
        <NodeIcon
          icon="/icons/bigquery.svg"
          top="70%"
          left="85%"
          label="BigQuery"
          align="right"
        />
      </div>
    </div>
  );
}

function NodeIcon({
  icon,
  top,
  left,
  label,
  align = "left",
  invertDark = false,
}: {
  icon: string;
  top: string;
  left: string;
  label: string;
  align?: "left" | "right" | "top" | "bottom";
  invertDark?: boolean;
}) {
  let flexDirection: "row" | "row-reverse" | "column" | "column-reverse" =
    "row";
  if (align === "right") flexDirection = "row-reverse";
  if (align === "bottom") flexDirection = "column";
  if (align === "top") flexDirection = "column-reverse";

  return (
    <div
      className="absolute flex items-center gap-3"
      style={{
        top,
        left,
        transform: "translate(-50%, -50%)",
        flexDirection,
      }}
    >
      <div className="w-12 h-12 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-lg flex items-center justify-center relative z-10">
        <Image
          src={icon}
          alt={label}
          width={24}
          height={24}
          className={`w-6 h-6 ${invertDark ? "dark:invert" : ""}`}
        />
      </div>
      <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm px-3 py-1 rounded-full border border-slate-200 dark:border-slate-700 hidden sm:block">
        <span className="text-xs font-medium text-slate-600 dark:text-slate-300 whitespace-nowrap">
          {label}
        </span>
      </div>
    </div>
  );
}

function MakoIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="102"
      height="90"
      viewBox="0 0 102 90"
      fill="none"
      className={className}
    >
      <path
        fill="currentColor"
        d="m58 0 44 77-8 13H7L0 77 43 0h15ZM6 77l3 5 36-64 9 16 17 30h6L45 8 6 77Zm79-8H34l-3 5h64L55 5h-6l36 64Zm-48-5h28L51 39 37 64Z"
      />
    </svg>
  );
}
