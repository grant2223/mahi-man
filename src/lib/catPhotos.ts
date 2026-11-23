// A real photo for each kind of work, by the category's icon key. Free photos from Unsplash (Unsplash License).
// A category with its own photo (photo_path, set in Admin) uses that instead; one with neither shows its icon.
export const UNS = (id: string, w: number) => `https://images.unsplash.com/photo-${id}?w=${w}&q=75&auto=format&fit=crop`;

export const CAT_PHOTO: Record<string, string> = {
  cleaning: "1758273238415-01ec03d9ef27", garden: "1458245201577-fc8a130b8829", moving: "1769972557854-7eae6f95585b",
  delivery: "1665521032636-e8d2f6927053", rubbish: "1670175035057-eec020c03eb9", assembly: "1772338537689-056082f100a9",
  handyman: "1645651964715-d200ce0939cc", maintenance: "1665442348932-6e16d72fe163", pets: "1534361960057-19889db9621e",
  errands: "1588964895597-cfccd6e2dbf9", car: "1605164598708-25701594473e", pool: "1762811054950-b74e0a055c80",
  events: "1555244162-803834f70033", kids: "1560785496-3c9d27877182", tech: "1586024486164-ce9b3d87e09f",
  social: "1611926653458-09294b3142bf", design: "1626785774573-4b799315345d", web: "1498050108023-c5249f4df085",
  writing: "1550592704-6c76defa9985", camera: "1497015289639-54688650d173", admin: "1583521214690-73421a1829a9",
  accounting: "1554224155-6726b3ff858f", fitness: "1775323005381-584af06d83d0", barber: "1503951914875-452162b0f3f1",
  beauty: "1516975080664-ed2fc6a32937", cooking: "1653233797467-1a528819fd4f", bike: "1675798227643-da319f8ee8f7",
  sewing: "1753162660069-d4145d9a95f7", other: "1663786056091-fcb790594901",
};

// How the services page groups the kinds of work, so people scan a handful of headings, not one long list.
export const CAT_GROUPS: [string, string[]][] = [
  ["Home and garden", ["cleaning", "garden", "pool", "maintenance", "handyman", "assembly"]],
  ["Moving and running around", ["moving", "delivery", "rubbish", "errands", "car", "bike"]],
  ["People and pets", ["fitness", "barber", "beauty", "kids", "pets", "sewing"]],
  ["Food and events", ["cooking", "events"]],
  ["Business and online", ["social", "design", "web", "camera", "writing", "admin", "accounting", "tech"]],
];
