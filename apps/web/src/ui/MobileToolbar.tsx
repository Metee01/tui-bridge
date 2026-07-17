import { type JSX } from "react";

interface MobileToolbarProps {
  enabled: boolean;
  mods: ReadonlySet<"Ctrl" | "Alt">;
  onToggleMod: (mod: "Ctrl" | "Alt") => void;
  onInput: (seq: string) => void;
  onShowKeyboard: () => void;
}

// Keys that don't exist on phone keyboards — shown as big tappable buttons.
const SPECIAL_KEYS: { label: string; seq: string }[] = [
  { label: "Pg↑", seq: "\x1b[5~" },
  { label: "Pg↓", seq: "\x1b[6~" },
  { label: "Home", seq: "\x1b[H" },
  { label: "End", seq: "\x1b[F" },
  { label: "Del", seq: "\x1b[3~" },
];

const ARROW_KEYS: { label: string; seq: string }[] = [
  { label: "↑", seq: "\x1b[A" },
  { label: "↓", seq: "\x1b[B" },
  { label: "→", seq: "\x1b[C" },
  { label: "←", seq: "\x1b[D" },
];

export function MobileToolbar(props: MobileToolbarProps): JSX.Element {
  const { enabled, mods, onToggleMod, onInput, onShowKeyboard } = props;

  return (
    <>
      <div className="toolbar-row">
        <button
          type="button"
          className={`keybutton keybutton--modifier ${mods.has("Ctrl") ? "keybutton--active" : ""}`}
          onTouchStart={(e) => {
            e.preventDefault();
            onToggleMod("Ctrl");
          }}
          onClick={() => onToggleMod("Ctrl")}
        >
          Ctrl
        </button>

        <button
          type="button"
          className={`keybutton keybutton--modifier ${mods.has("Alt") ? "keybutton--active" : ""}`}
          onTouchStart={(e) => {
            e.preventDefault();
            onToggleMod("Alt");
          }}
          onClick={() => onToggleMod("Alt")}
        >
          Alt
        </button>

        <button
          type="button"
          className="keybutton keybutton--keyboard"
          disabled={!enabled}
          onTouchStart={(e) => {
            e.preventDefault();
            onShowKeyboard();
          }}
          onClick={onShowKeyboard}
        >
          Keyboard
        </button>

        <SpecialButton label="Esc" seq="\x1b" enabled={enabled} onInput={onInput} />
        <SpecialButton label="Tab" seq="\t" enabled={enabled} onInput={onInput} />
      </div>

      {/* Row 2: arrows + page navigation */}
      <div className="toolbar-row toolbar-row--scroll">
        {ARROW_KEYS.map((k) => (
          <SpecialButton key={k.label} label={k.label} seq={k.seq} enabled={enabled} onInput={onInput} />
        ))}
        {SPECIAL_KEYS.map((k) => (
          <SpecialButton key={k.label} label={k.label} seq={k.seq} enabled={enabled} onInput={onInput} />
        ))}
      </div>
    </>
  );
}

function SpecialButton({
  label,
  seq,
  enabled,
  onInput,
}: {
  label: string;
  seq: string;
  enabled: boolean;
  onInput: (seq: string) => void;
}): JSX.Element {
  return (
    <button
      type="button"
      className="keybutton keybutton--special"
      disabled={!enabled}
      onTouchStart={(e) => {
        e.preventDefault();
        onInput(seq);
      }}
      onClick={() => {
        if (enabled) onInput(seq);
      }}
    >
      {label}
    </button>
  );
}
