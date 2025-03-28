import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { GoogleGenerativeAI } from "@google/generative-ai";
import axios from "axios";
import * as cheerio from "cheerio";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API);
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

async function extractWithCheerio(html) {
  const $ = cheerio.load(html);
  try {
    const ingredients = [];
    const instructions = [];
    const title = $("h1").first().text().trim();
    console.log("title", title);

    $(
      "[data-ingredient], .ingredients-item, .ingredient-list li, .ingredients__itemWrapper"
    ).each((_, elem) => {
      const text = $(elem).text().trim();
      if (text) ingredients.push(text);
    });

    $(
      "[data-instruction], .instructions__item, .recipe__instructions li, .direction-lists li"
    ).each((_, elem) => {
      const text = $(elem).text().trim();
      if (text) instructions.push(text);
    });

    if (ingredients.length === 0 && instructions.length === 0) {
      console.log("No recipe data found with Cheerio");
      return null;
    }

    return { title, ingredients, instructions };
  } catch (error) {
    console.error("Error parsing with Cheerio:", error);
    return null;
  }
}
async function extractWithGemini(url) {
  try {
    const prompt = `Extract the recipe ingredients and instructions from this URL: ${url}
    - only use information from this url. do not guess or add additional information
    - do not fill recipe if model can't browse the website
    - in notes report whether you visited the site or not
    - if you're unable to visit the site, just return json with status of the site and the error message
    - also report whether you used "grounding"  
    - for quantity instead of fractions
    - ingredients, use singular if it's a measurement, but keep plural if it's an item
    Return the response in this format with this structure:
    {
      "title": "Recipe Title",
      "ingredients": [{"ingredient name": "name", "quantity": "quantity", "unit": "unit"}],
      "instructions": ["step 1", "step 2"],
      "short description": "short description of the recipe",
      "status": "status of the site",
      "error": "error message",
      "grounding": "true/false",
      "notes": "other output from llm",
      "original_url": "original url"
    }`;

    const result = await model.generateContent([prompt]);
    return result.response.text();
  } catch (error) {
    console.error("Error using Gemini:", error);
    return null;
  }
}

async function scrapeRecipe(url) {
  try {
    console.log("Attempting web scraping...");
    const response = await axios.get(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Accept-Encoding": "gzip, deflate, br",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
      },
      validateStatus: function (status) {
        return true;
      },
    });

    console.log(`Scraping status: ${response.status}`);

    if (response.status !== 200) {
      return null;
    }

    return await extractWithCheerio(response.data);
  } catch (error) {
    console.log("Scraping failed:", error.message);
    return null;
  }
}

async function main() {
  const recipeUrl =
    "https://www.hungryhuy.com/bo-kho-recipe-vietnamese-beef-stew/";
  if (!process.env.GEMINI_API) {
    console.error("Please set your GEMINI_API in .env.local file");
    return;
  }

  // Try web scraping first
  const scrapedData = await scrapeRecipe(recipeUrl);
  if (scrapedData) {
    console.log("\nRecipe extracted via web scraping:");
    console.log(JSON.stringify(scrapedData, null, 2));
    return;
  }

  // Fallback to Gemini
  console.log("\nFalling back to Gemini...");
  const geminiData = await extractWithGemini(recipeUrl);

  if (geminiData) {
    console.log("\nRecipe extracted via Gemini:");
    // console.log(JSON.stringify(geminiData, null, 2));
    console.log(geminiData);
  } else {
    console.log("Failed to extract recipe data");
  }
}

main().catch(console.error);
