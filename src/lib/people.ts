// The answers people pick from in "About you", and that the admin filters and counts on. Kept in one place so they always match.
export const GENDERS: [string, string][] = [["woman", "Woman"], ["man", "Man"], ["another", "Another way"], ["not_say", "Prefer not to say"]];
export const HEARD = ["Facebook", "Instagram", "TikTok", "Google", "A friend", "Flyer or sign", "Saw a worker", "Other"];
export const AGES = ["18–24", "25–34", "35–44", "45–54", "55–64", "65+"];
export const NATIONALITIES = [
  "Australian", "New Zealander", "British", "Irish", "American", "Canadian", "South African", "Filipino", "Indian", "Chinese", "Japanese", "Korean",
  "Vietnamese", "Thai", "Indonesian", "Malaysian", "Singaporean", "Nepalese", "Sri Lankan", "Pakistani", "Bangladeshi", "Papua New Guinean", "Fijian",
  "Samoan", "Tongan", "German", "French", "Italian", "Spanish", "Dutch", "Swedish", "Norwegian", "Danish", "Finnish", "Swiss", "Austrian", "Belgian",
  "Polish", "Czech", "Greek", "Portuguese", "Brazilian", "Argentinian", "Chilean", "Colombian", "Mexican", "Taiwanese", "Hong Konger", "Other",
];

// Country codes for a mobile number: [country code, country, dial code]. Australia and New Zealand first.
export const DIAL_CODES: [string, string, string][] = [
  ["AU", "Australia", "61"], ["NZ", "New Zealand", "64"], ["GB", "United Kingdom", "44"], ["IE", "Ireland", "353"], ["US", "United States", "1"],
  ["CA", "Canada", "1"], ["ZA", "South Africa", "27"], ["PH", "Philippines", "63"], ["IN", "India", "91"], ["CN", "China", "86"], ["JP", "Japan", "81"],
  ["KR", "South Korea", "82"], ["VN", "Vietnam", "84"], ["TH", "Thailand", "66"], ["ID", "Indonesia", "62"], ["MY", "Malaysia", "60"], ["SG", "Singapore", "65"],
  ["NP", "Nepal", "977"], ["LK", "Sri Lanka", "94"], ["PK", "Pakistan", "92"], ["BD", "Bangladesh", "880"], ["PG", "Papua New Guinea", "675"], ["FJ", "Fiji", "679"],
  ["WS", "Samoa", "685"], ["TO", "Tonga", "676"], ["DE", "Germany", "49"], ["FR", "France", "33"], ["IT", "Italy", "39"], ["ES", "Spain", "34"], ["NL", "Netherlands", "31"],
  ["SE", "Sweden", "46"], ["NO", "Norway", "47"], ["DK", "Denmark", "45"], ["FI", "Finland", "358"], ["CH", "Switzerland", "41"], ["AT", "Austria", "43"], ["BE", "Belgium", "32"],
  ["PL", "Poland", "48"], ["CZ", "Czech Republic", "420"], ["GR", "Greece", "30"], ["PT", "Portugal", "351"], ["BR", "Brazil", "55"], ["AR", "Argentina", "54"], ["CL", "Chile", "56"],
  ["CO", "Colombia", "57"], ["MX", "Mexico", "52"], ["TW", "Taiwan", "886"], ["HK", "Hong Kong", "852"], ["AE", "United Arab Emirates", "971"],
];
export const flag = (iso: string) => iso.toUpperCase().replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));
// +61412345678 → +61 412 345 678
export const showPhone = (full: string, dial: string) => {
  const rest = full.replace(`+${dial}`, "");
  return `+${dial} ${rest.replace(/(\d{3})(?=\d{3,})/g, "$1 ")}`;
};
