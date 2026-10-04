export const NAME_PALETTE = ['#53c4fd', '#f9a129', '#cfa8fe', '#edd13d', '#8f9bff', '#acb1bb'];

export const getNameColor = (userId: string): string => {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return NAME_PALETTE[Math.abs(hash) % NAME_PALETTE.length];
};

export const buildNameColorMap = (userIds: string[]): Record<string, string> => {
  const unique = Array.from(new Set(userIds.filter(Boolean))).sort();
  const map: Record<string, string> = {};
  unique.forEach((id, i) => {
    map[id] = NAME_PALETTE[i % NAME_PALETTE.length];
  });
  return map;
};
