// src/renderer/components/StatusBar.tsx
import React from "react";
import { SessionIndicator } from "./SessionIndicator";
import { TokenCounter } from "./TokenCounter";
import { LimitBar } from "./LimitBar";
import { ActivitySparkline } from "./ActivitySparkline";
import { ActivityDetail } from "./ActivityDetail";
import { ConversationPreview } from "./ConversationPreview";
import {
  ClaudeUsageState,
  SnapEdge,
  ActivitySnapshot,
} from "../../shared/types";
import clawdVideo from "../assets/clawd-laptop.webm";

interface StatusBarProps {
  state: ClaudeUsageState;
  snapEdge: SnapEdge;
  activityHistory: ActivitySnapshot[];
  isExpanded: boolean;
  hasUpdate: boolean;
  conversationPreview: string;
  onToggleExpanded: () => void;
  onHelp: () => void;
}

function ClaudeMascot({ isActive }: { isActive: boolean }) {
  const ref = React.useRef<HTMLVideoElement>(null);

  React.useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (isActive) {
      v.play();
    } else {
      v.pause();
      v.currentTime = 0;
    }
  }, [isActive]);

  return (
    <div className="flex-shrink-0 w-[56px] h-[56px] overflow-hidden relative">
      <video
        ref={ref}
        src={clawdVideo}
        autoPlay
        loop
        muted
        playsInline
        width={90}
        height={90}
        className="absolute top-1/2 left-1/2 -translate-x-[calc(50%+10px)] -translate-y-[calc(50%+20px)]"
        style={{ minWidth: 90, minHeight: 90, objectFit: 'contain' }}
      />
    </div>
  );
}

function getBorderRadius(edge: SnapEdge): string {
  switch (edge) {
    case "top":
      return "rounded-b-2xl";
    case "bottom":
      return "rounded-t-lg";
    case "left":
      return "rounded-r-lg";
    case "right":
      return "rounded-l-lg";
  }
}

function HelpButton({ onClick, hasUpdate }: { onClick: () => void; hasUpdate: boolean }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="relative flex items-center justify-center w-7 h-7 rounded-md bg-claude-orange/20 border border-claude-orange/50 text-claude-orange hover:bg-claude-orange/40 hover:border-claude-orange transition-colors text-xs font-bold leading-none flex-shrink-0 cursor-pointer"
      title={hasUpdate ? "Update available! Click to update" : "Help & shortcuts"}
    >
      {hasUpdate && (
        <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-claude-orange animate-pulse" />
      )}
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    </button>
  );
}

export function StatusBar({
  state,
  snapEdge,
  activityHistory,
  isExpanded,
  hasUpdate,
  conversationPreview,
  onToggleExpanded,
  onHelp,
}: StatusBarProps) {
  const isVertical = snapEdge === "left" || snapEdge === "right";
  const orientation = isVertical ? "vertical" : "horizontal";
  const radius = getBorderRadius(snapEdge);

  if (isVertical) {
    return (
      <div
        className={`flex flex-col items-center gap-2 px-2 py-3 bg-claude-bg border border-claude-border ${radius} shadow-lg ${isExpanded ? "w-[260px]" : "w-[80px]"} transition-all duration-300`}
      >
        <div
          className={`flex ${isExpanded ? "flex-row items-start gap-3 w-full" : "flex-col items-center gap-2"}`}
        >
          <div className="flex flex-col items-center gap-2 position-relative">
            <ClaudeMascot isActive={state.session.isActive} />
            <div className="h-px w-8 bg-claude-border" />
            <SessionIndicator
              isActive={state.session.isActive}
              model={state.currentModel}
              orientation="vertical"
            />
            <div className="h-px w-8 bg-claude-border" />
            <TokenCounter tokens={state.tokens} orientation="vertical" />
            <div className="h-px w-8 bg-claude-border" />
            <ActivitySparkline
              history={activityHistory}
              orientation="vertical"
              onClick={onToggleExpanded}
            />
            <div className="h-px w-8 bg-claude-border" />
            <div className="flex gap-2">
              <LimitBar
                label="H"
                ratio={state.limits.hourlyUsed}
                orientation="vertical"
              />
              <LimitBar
                label="W"
                ratio={state.limits.weeklyUsed}
                orientation="vertical"
              />
            </div>
            {conversationPreview && state.session.isActive && (
              <>
                <div className="h-px w-8 bg-claude-border" />
                <ConversationPreview text={conversationPreview} orientation="vertical" />
              </>
            )}
            <div className="h-px w-8 bg-claude-border" />
            <HelpButton onClick={onHelp} hasUpdate={hasUpdate} />
          </div>
          {isExpanded && (
            <div className="flex-1">
              <ActivityDetail
                history={activityHistory}
                orientation="vertical"
                onClick={onToggleExpanded}
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col bg-claude-bg border border-claude-border ${radius} shadow-lg ${isExpanded ? "h-[200px]" : "h-[68px]"} transition-all duration-300`}
    >

      <div className="flex items-center gap-2 px-2 pt-0 pb-1 h-[68px] shrink-0">
        <ClaudeMascot isActive={state.session.isActive} />
        <div className="w-px h-8 bg-claude-border" />
        <SessionIndicator
          isActive={state.session.isActive}
          model={state.currentModel}
          orientation="horizontal"
        />
        <div className="w-px h-8 bg-claude-border" />
        <TokenCounter tokens={state.tokens} orientation="horizontal" />
        <div className="w-px h-8 bg-claude-border" />
        <ActivitySparkline
          history={activityHistory}
          orientation="horizontal"
          onClick={onToggleExpanded}
        />
        <div className="w-px h-8 bg-claude-border" />
        <div className="flex flex-col gap-1 flex-1">
          <LimitBar
            label="Hour"
            ratio={state.limits.hourlyUsed}
            orientation="horizontal"
          />
          <LimitBar
            label="Week"
            ratio={state.limits.weeklyUsed}
            orientation="horizontal"
          />
        </div>
        <div className="w-px h-8 bg-claude-border" />
        <HelpButton onClick={onHelp} hasUpdate={hasUpdate} />
      </div>
      {conversationPreview && state.session.isActive && !isExpanded && (
        <div className="border-t border-claude-border px-3 py-0.5 overflow-hidden">
          <ConversationPreview text={conversationPreview} orientation="horizontal" />
        </div>
      )}
      {isExpanded && (
        <div className="flex-1 border-t border-claude-border overflow-hidden">
          <ActivityDetail
            history={activityHistory}
            orientation="horizontal"
            onClick={onToggleExpanded}
          />
        </div>
      )}
    </div>
  );
}
