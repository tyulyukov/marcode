import { useTheme } from "../../hooks/useTheme";
import { THEME_GROUPS, THEME_REGISTRY } from "../../themes";
import {
  Select,
  SelectGroup,
  SelectGroupLabel,
  SelectItem,
  SelectPopup,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "../ui/select";

export function ThemePicker() {
  const { theme, activeTheme, setTheme } = useTheme();

  const displayLabel = theme === "system" ? `System (${activeTheme.label})` : activeTheme.label;

  return (
    <Select
      value={theme}
      onValueChange={(value) => {
        if (value !== null) setTheme(value);
      }}
    >
      <SelectTrigger className="w-full sm:w-56" aria-label="Theme preference">
        <SelectValue>{displayLabel}</SelectValue>
      </SelectTrigger>
      <SelectPopup align="end" alignItemWithTrigger={false}>
        <SelectItem hideIndicator value="system">
          System
        </SelectItem>
        {THEME_GROUPS.map(({ group, label }) => {
          const groupThemes = THEME_REGISTRY.filter((t) => t.group === group);
          if (groupThemes.length === 0) return null;
          return (
            <SelectGroup key={group}>
              <SelectSeparator />
              <SelectGroupLabel>{label}</SelectGroupLabel>
              {groupThemes.map((t) => (
                <SelectItem hideIndicator key={t.id} value={t.id}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectGroup>
          );
        })}
      </SelectPopup>
    </Select>
  );
}
