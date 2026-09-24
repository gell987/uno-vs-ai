type ImageFont = { name: string; data: ArrayBuffer; weight: 400 | 500 | 600; style: "normal" };

/**
 * Loads a Google font for generated images at build time, subset to the
 * characters actually drawn. Returns nothing if offline (the default font is used).
 */
export async function loadGoogleFont(family: string, text: string, weight: 400 | 500 | 600 = 400): Promise<ImageFont[]> {
  try {
    const query = `family=${family.replace(/ /g, "+")}:wght@${weight}&text=${encodeURIComponent(text)}`;
    const css = await (await fetch(`https://fonts.googleapis.com/css2?${query}`)).text();
    const url = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/)?.[1];
    if (!url) return [];
    const data = await (await fetch(url)).arrayBuffer();
    return [{ name: family, data, weight, style: "normal" }];
  } catch {
    return [];
  }
}
