export interface SearchConfig {
  searchBaseUrl: string;
  searchEngines?: string;
}

export async function search(config: SearchConfig, query: string) {
  const params = new URLSearchParams({
    q: query,
    format: "json",
  });
  if (config.searchEngines) {
    params.append("engines", config.searchEngines);
  }
  const resp = await fetch(
    `${config.searchBaseUrl}/search?${params.toString()}`,
  );
  const results = await resp.json() as SearchResults;
  return results;
}

export interface SearchResults {
  query: string;
  number_of_results: number;
  results: Result[];
  answers: string[];
  corrections: any[];
  infoboxes: Infobox[];
  suggestions: any[];
  unresponsive_engines: any[];
}

export interface Result {
  url: string;
  title: string;
  engine: string;
  parsed_url: string[];
  engines: string[];
  positions: number[];
  score: number;
  category: string;
  pretty_url: string;
  content?: string;
}

export interface Infobox {
  infobox: string;
  id: string;
  content: string;
  img_src: string;
  urls: Url[];
  engine: string;
  engines: string[];
  attributes: Attribute[];
}

export interface Url {
  title: string;
  url: string;
}

export interface Attribute {
  label: string;
  value: string;
  entity: string;
}
