"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";

export default function Navigation() {
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 0);
    };

    // Check initial scroll position
    handleScroll();

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div className="sticky top-0 z-50 flex justify-center pt-4 px-4">
      <nav
        className={`w-full max-w-7xl border transition-all duration-300 ${
          isScrolled
            ? "shadow-md rounded-2xl border-slate-200/70 dark:border-slate-700/70 bg-white/70 dark:bg-slate-900/70 backdrop-blur-lg border-slate-200/70 dark:border-slate-700/70"
            : "border-transparent"
        }`}
      >
        <div className="px-6 py-2">
          <div className="flex items-center h-14">
            {/* Logo - Left */}
            <div className="flex items-center flex-1">
              <Image
                src="/mako-icon.svg"
                alt="Mako Logo"
                width={28}
                height={28}
                className="mr-2 w-7 h-7"
              />
              <span className="text-2xl font-[900] text-black">MAKO</span>
            </div>

            {/* Links - Center */}
            <div className="hidden md:flex items-center space-x-6 flex-1 justify-center">
              <Link
                href="#features"
                className="text-sm text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors"
              >
                Features
              </Link>
              <Link
                href="#integrations"
                className="text-sm text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors"
              >
                Integrations
              </Link>
              <Link
                href="#docs"
                className="text-sm text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors"
              >
                Documentation
              </Link>
            </div>

            {/* Login Button - Right */}
            <div className="flex items-center flex-1 justify-end">
              <a
                href="http://localhost:5173"
                className="px-3 py-1.5 text-sm rounded-lg bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-medium hover:from-blue-700 hover:to-cyan-700 transition-all shadow-md hover:shadow-lg"
              >
                Launch App
              </a>
            </div>
          </div>
        </div>
      </nav>
    </div>
  );
}
