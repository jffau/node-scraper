import { chromium } from "playwright";
import { z } from "zod";
import { createOpenAI } from "@ai-sdk/openai";
import LLMScraper from "llm-scraper";
import { config } from "dotenv";
import * as fs from "fs";
import * as path from "path";

// Load environment variables from .env.local
config({ path: ".env.local" });

// Ensure the API key is loaded
if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY is not defined in .env.local");
}

// Initialize OpenAI with the API key
const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  compatibility: "strict", // strict mode, enable when using the OpenAI API
});
// Initialize LLM provider
console.time("Scraper Initialization");
const llm = openai.chat("gpt-4o");
const scraper = new LLMScraper(llm);
console.timeEnd("Scraper Initialization");

console.log("Starting browser...");
console.time("Browser Launch");
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
console.timeEnd("Browser Launch");

console.log("Visiting Page...");
console.time("Page Visit");
await page.goto(
  "https://www.hungryhuy.com/bo-kho-recipe-vietnamese-beef-stew/"
);
console.timeEnd("Page Visit");

const prompt = `You are a sophisticated web scraper. Extract the contents of the webpage. for quantity in ingredients, use number instead of fractions. Try to use same unit text for same units e.g. tsps=teaspoon etc. Try to find an image to use as the main image for the recipe. If you can't find one, leave it blank.
    Don't put ingredients into optional unless it's explicitly marked. Follow schema and don't use invalid types`;
const schema = z.object({
  top: z
    .object({
      title: z.string(),
      originalUrl: z.string(),
      summary: z.string(),
      mainImgUrl: z.string().optional().nullable(),
      instructions: z.array(z.string()),
      ingredients: z.object({
        main: z.array(
          z.object({ name: z.string(), quantity: z.string(), unit: z.string() })
        ),
        optional: z.array(
          z.object({
            name: z.string(),
            quantity: z.string(),
            unit: z.string(),
          })
        ),
      }),
      servings: z.number().optional().nullable(),
    })
    .describe("Recipe summary"),
  status: z.string().optional().nullable(),
});

console.log("Running LLM scraper...");
console.time("LLM Scraper Run");
const { data } = await scraper.run(page, schema, {
  format: "cleanup",
  prompt,
});
console.timeEnd("LLM Scraper Run");

console.time("Save Data to File");
saveDataToFile(data);
console.timeEnd("Save Data to File");

function saveDataToFile(data: any) {
  const outputDir = "./output";
  const timestamp = Date.now();
  const filename = `${data?.top?.title}-${timestamp}.json`;
  const filePath = path.join(outputDir, filename);

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  console.log(`Data saved to ${filePath}`);
}

console.time("Browser Teardown");
await page.close();
await browser.close();
console.timeEnd("Browser Teardown");
