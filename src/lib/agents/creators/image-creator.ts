import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import type { AIImage } from '../types';

/**
 * IMAGE CREATOR
 *
 * Purpose: Generate AI image from an idea
 *
 * Two-step process:
 * 1. LLM creates detailed image generation prompt from idea
 * 2. Image API generates the actual image
 *
 * Supported APIs (in priority order):
 * - fal.ai (fast, generous free tier, high quality)
 * - Hugging Face Inference API (free tier)
 * - Replicate (paid but cheapest)
 */
export async function createAIImage(idea: any): Promise<{
  content: AIImage;
  tokensUsed: number;
}> {
  // Step 1: Generate image prompt from idea using LLM
  const { prompt, tokensUsed } = await generateImagePrompt(idea);

  // Step 2: Generate image using API
  const imageResult = await generateImage(prompt);

  return {
    content: {
      prompt,
      imageUrl: imageResult.url,
      model: imageResult.model,
      width: imageResult.width,
      height: imageResult.height,
    },
    tokensUsed,
  };
}

/**
 * Use LLM to create a detailed image generation prompt
 */
async function generateImagePrompt(idea: any): Promise<{
  prompt: string;
  tokensUsed: number;
}> {
  const systemPrompt = `You are an expert at creating prompts for AI image generation.

Convert this idea into a detailed, vivid image generation prompt.

Idea Details:
Title: ${idea.title}
Description: ${idea.description || 'No description'}
Key Points: ${JSON.stringify(idea.bullets) || 'None'}

Guidelines for the image prompt:
- Be SPECIFIC about style (e.g., "digital art", "oil painting", "3D render", "photograph")
- Describe composition, lighting, colors, mood
- Include artistic references if relevant (e.g., "in the style of...")
- Mention technical details (e.g., "ultra detailed", "8K", "cinematic lighting")
- Keep it 2-4 sentences, highly descriptive
- Focus on VISUAL elements, not abstract concepts

Examples of good prompts:
- "A futuristic cityscape at sunset, neon lights reflecting on wet streets, cyberpunk aesthetic, highly detailed digital art, vibrant purple and blue tones"
- "Abstract visualization of neural networks, flowing data streams in electric blue and gold, dark background, ethereal glow, digital art style"
- "Cozy home office setup with plants, warm natural lighting through window, minimalist Scandinavian design, soft focus photography"

Respond with ONLY the image prompt (no JSON, no explanation).`;

  // Try OpenAI first
  try {
    const model = new ChatOpenAI({
      modelName: 'gpt-4o-mini',
      temperature: 0.9, // High creativity for prompt generation
      maxTokens: 200,
      apiKey: process.env.OPENAI_API_KEY,
    });

    const response = await model.invoke(systemPrompt);
    return {
      prompt: response.content.toString().trim(),
      tokensUsed: response.usage_metadata?.total_tokens || 0,
    };
  } catch (openaiError) {
    console.warn('OpenAI failed for prompt generation, falling back to Anthropic:', openaiError);

    // Fallback to Anthropic
    const model = new ChatAnthropic({
      modelName: 'claude-3-5-haiku-20241022',
      temperature: 0.9,
      maxTokens: 200,
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const response = await model.invoke(systemPrompt);
    return {
      prompt: response.content.toString().trim(),
      tokensUsed: response.usage_metadata?.total_tokens || 0,
    };
  }
}

/**
 * Generate image using available APIs (in priority order)
 */
async function generateImage(prompt: string): Promise<{
  url: string;
  model: string;
  width: number;
  height: number;
}> {
  // Try fal.ai first (fast + generous free tier)
  if (process.env.FAL_KEY) {
    try {
      return await generateWithFal(prompt);
    } catch (falError) {
      console.warn('fal.ai failed, trying next option:', falError);
    }
  }

  // Try Hugging Face (free tier)
  if (process.env.HUGGINGFACE_API_KEY) {
    try {
      return await generateWithHuggingFace(prompt);
    } catch (hfError) {
      console.warn('Hugging Face failed, trying next option:', hfError);
    }
  }

  // Try Replicate (paid but cheap)
  if (process.env.REPLICATE_API_TOKEN) {
    try {
      return await generateWithReplicate(prompt);
    } catch (repError) {
      console.warn('Replicate failed:', repError);
    }
  }

  throw new Error('No image generation API available or all failed');
}

/**
 * Generate image with fal.ai (FLUX Schnell - fast & high quality)
 */
async function generateWithFal(prompt: string): Promise<{
  url: string;
  model: string;
  width: number;
  height: number;
}> {
  const response = await fetch('https://fal.run/fal-ai/flux/schnell', {
    method: 'POST',
    headers: {
      Authorization: `Key ${process.env.FAL_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt,
      image_size: 'landscape_16_9',
      num_images: 1,
    }),
  });

  if (!response.ok) {
    throw new Error(`fal.ai error: ${response.statusText}`);
  }

  const data = await response.json();
  const imageUrl = data.images[0].url;

  return {
    url: imageUrl,
    model: 'flux-schnell (fal.ai)',
    width: 1360,
    height: 768,
  };
}

/**
 * Generate image with Hugging Face (FLUX or Stable Diffusion)
 */
async function generateWithHuggingFace(prompt: string): Promise<{
  url: string;
  model: string;
  width: number;
  height: number;
}> {
  // Using Stable Diffusion XL (reliable free tier model)
  const model = 'stabilityai/stable-diffusion-xl-base-1.0';

  const response = await fetch(
    `https://api-inference.huggingface.co/models/${model}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ inputs: prompt }),
    }
  );

  if (!response.ok) {
    throw new Error(`Hugging Face error: ${response.statusText}`);
  }

  // HF returns image as blob
  const blob = await response.blob();

  // Convert blob to base64 data URL (we'll save to Supabase Storage later)
  const buffer = await blob.arrayBuffer();
  const base64 = Buffer.from(buffer).toString('base64');
  const dataUrl = `data:image/png;base64,${base64}`;

  return {
    url: dataUrl, // Publisher will upload this to Supabase Storage
    model: 'SDXL (Hugging Face)',
    width: 1024,
    height: 1024,
  };
}

/**
 * Generate image with Replicate (FLUX Dev - highest quality)
 */
async function generateWithReplicate(prompt: string): Promise<{
  url: string;
  model: string;
  width: number;
  height: number;
}> {
  // Start prediction
  const startResponse = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: {
      Authorization: `Token ${process.env.REPLICATE_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      version: 'black-forest-labs/flux-schnell',
      input: {
        prompt,
        num_outputs: 1,
        aspect_ratio: '16:9',
        output_format: 'png',
      },
    }),
  });

  if (!startResponse.ok) {
    throw new Error(`Replicate error: ${startResponse.statusText}`);
  }

  const prediction = await startResponse.json();

  // Poll for result (Replicate is async)
  let result = prediction;
  while (result.status !== 'succeeded' && result.status !== 'failed') {
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const pollResponse = await fetch(
      `https://api.replicate.com/v1/predictions/${result.id}`,
      {
        headers: {
          Authorization: `Token ${process.env.REPLICATE_API_TOKEN}`,
        },
      }
    );

    result = await pollResponse.json();
  }

  if (result.status === 'failed') {
    throw new Error('Replicate generation failed');
  }

  const imageUrl = Array.isArray(result.output) ? result.output[0] : result.output;

  return {
    url: imageUrl,
    model: 'flux-schnell (Replicate)',
    width: 1360,
    height: 768,
  };
}
