import { coverBackground } from "./game-cover.js";

/**
 * What an advertiser sees of a game: the card the developer has in the game's Settings, read-only. One query for
 * all the games of a list; `states` are the rows of the list (id, game, state, label, impressions) and `placementCount`
 * says how many placements of the game the campaign uses.
 */
export async function loadGameCards(service, states, placementCount = () => 0, viewsText = (state) => `${state.impressions} views of this campaign`) {
  const ids = states.map((state) => state.id);
  const read = (columns) => (ids.length ? service.from("games").select(columns).in("id", ids) : Promise.resolve({ data: [], error: null }));
  let { data, error } = await read("id, name, genres, platforms, languages, countries, icon_path, cover, devices, play_modes");
  if (error) ({ data, error } = await read("id, name, genres, platforms, languages, icon_path, cover, devices, play_modes"));
  if (error) ({ data } = await read("id, name, genres, platforms, languages, icon_path"));
  const byId = new Map((data ?? []).map((row) => [row.id, row]));
  const urlOf = (path) => service.storage.from("creatives").getPublicUrl(path).data.publicUrl;
  const cards = {};
  states.forEach((state, index) => {
    const row = byId.get(state.id) ?? {};
    cards[state.id] = {
      name: state.game,
      iconUrl: row.icon_path ? urlOf(row.icon_path) : "",
      coverCss: coverBackground(row.cover ?? null, index, urlOf),
      hasPicture: typeof row.cover === "string" && row.cover.startsWith("image:"),
      form: { name: state.game, genres: row.genres ?? [], platforms: row.platforms ?? [], languages: row.languages ?? [], countries: row.countries ?? [], devices: row.devices ?? [], playModes: row.play_modes ?? [] },
      state: state.state,
      label: state.label,
      views: viewsText(state),
      placements: placementCount(state),
      campaigns: 1,
    };
  });
  return cards;
}
