export interface ModifierOptionLike {
  name: string;
  priceMinor: number;
}

export interface ModifierGroupLike {
  name: string;
  required?: boolean | null;
  max?: number | null;
  options: ModifierOptionLike[];
}

export interface SelectedModifierLike {
  groupName: string;
  optionName: string;
  priceMinor?: number;
}

export interface ResolvedModifierSelection {
  groupName: string;
  optionName: string;
  priceMinor: number;
}

export function maxSelectionsForModifierGroup(group: ModifierGroupLike): number {
  if (group.options.length === 0) return 0;
  if (!group.max || group.max < 1) return group.options.length;
  return Math.min(group.max, group.options.length);
}

export function validateModifierSelection(
  groups: ModifierGroupLike[],
  selected: SelectedModifierLike[],
  itemName = 'This item',
): { ok: true; modifiers: ResolvedModifierSelection[] } | { ok: false; error: string } {
  const groupsByName = new Map(groups.map((group) => [group.name, group]));
  const selectedByGroup = new Map<string, ResolvedModifierSelection[]>();

  for (const modifier of selected) {
    const group = groupsByName.get(modifier.groupName);
    if (!group) {
      return { ok: false, error: `Invalid modifier group for ${itemName}.` };
    }

    const option = group.options.find((candidate) => candidate.name === modifier.optionName);
    if (!option) {
      return { ok: false, error: `Invalid modifier for ${itemName}.` };
    }

    const groupSelections = selectedByGroup.get(group.name) ?? [];
    if (groupSelections.some((entry) => entry.optionName === option.name)) {
      return { ok: false, error: `${group.name} includes the same option more than once.` };
    }

    groupSelections.push({
      groupName: group.name,
      optionName: option.name,
      priceMinor: option.priceMinor,
    });
    selectedByGroup.set(group.name, groupSelections);
  }

  for (const group of groups) {
    const groupSelections = selectedByGroup.get(group.name) ?? [];
    if (group.required && groupSelections.length === 0) {
      return { ok: false, error: `${group.name} is required for ${itemName}.` };
    }

    const limit = maxSelectionsForModifierGroup(group);
    if (groupSelections.length > limit) {
      return {
        ok: false,
        error:
          limit === 1
            ? `${group.name} allows only one selection.`
            : `${group.name} allows at most ${limit} selections.`,
      };
    }
  }

  const modifiers = groups.flatMap((group) => selectedByGroup.get(group.name) ?? []);
  return { ok: true, modifiers };
}
