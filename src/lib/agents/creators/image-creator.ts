import { ChatOpenAI } from '@langchain/openai';
import type { ImageSpec, GeneratedImage } from '../types';

/**
 * IMAGE GENERATION SUBAGENT
 *
 * NOT a standalone creator - used as subcomponent by blog creators
 *
 * This module provides modular image generation functions:
 * - createImagePrompt: Generate detailed prompt from concept
 * - generateImage: Create actual image via API
 * - generateImageCaption: Create caption for image
 * - generateImageForContent: Complete pipeline
 *
 * Supported APIs (in priority order):
 * - fal.ai (fast, generous free tier, high quality)
 * - Hugging Face Inference API (free tier)
 * - Replicate (paid but cheapest)
 */

/**
 * Generate detailed image prompt from concept
 * Used by blog creators to create context-aware images
 */
export async function createImagePrompt(
  spec: ImageSpec,
  contentContext?: string // Optional context from blog/thread
): Promise<string> {
  const model = new ChatOpenAI({
    modelName: 'gpt-4o-mini-2024-07-18',
    temperature: 0.9, // High creativity
    apiKey: process.env.OPENAI_API_KEY,
  });

  const prompt = `Create a detailed image generation prompt for this concept:

CONCEPT: ${spec.concept}
STYLE: ${spec.style || 'professional illustration'}
PLACEMENT: ${spec.placement} ${contentContext ? `in content about: "${contentContext.substring(0, 200)}..."` : ''}

Requirements:
- Be specific about composition, lighting, colors, mood
- Include style references if appropriate
- Make it vivid and descriptive
- Optimize for FLUX Schnell or Stable Diffusion
- Focus on VISUAL elements, not abstract concepts

Examples of good prompts:
- "A futuristic cityscape at sunset, neon lights reflecting on wet streets, cyberpunk aesthetic, highly detailed digital art, vibrant purple and blue tones"
- "Abstract visualization of neural networks, flowing data streams in electric blue and gold, dark background, ethereal glow, digital art style"

Return ONLY the prompt text (no JSON, no explanation).`;

  const response = await model.invoke(prompt);
  return response.content.toString().trim();
}

/**
 * Generate caption for image
 * Creates concise, descriptive alt text
 */
export async function generateImageCaption(
  imagePrompt: string,
  concept: string
): Promise<string> {
  const model = new ChatOpenAI({
    modelName: 'gpt-4o-mini-2024-07-18',
    temperature: 0.7,
    apiKey: process.env.OPENAI_API_KEY,
  });

  const prompt = `Create a concise, descriptive caption for this image:

IMAGE PROMPT: ${imagePrompt}
CONCEPT: ${concept}

Return a single sentence caption (< 100 chars) suitable for alt text and display.
No quotes, just the caption text.`;

  const response = await model.invoke(prompt);
  return response.content.toString().trim();
}

/**
 * Complete image generation pipeline
 * This is the main function that blog creators should use
 */
export async function generateImageForContent(
  spec: ImageSpec,
  contentContext?: string
): Promise<GeneratedImage> {
  console.log(`🎨 Generating image for: ${spec.concept}`);

  // Step 1: Create detailed prompt
  const imagePrompt = await createImagePrompt(spec, contentContext);
  console.log(`   📝 Prompt: ${imagePrompt.substring(0, 60)}...`);

  // Step 2: Generate image
  const { url, model, width, height } = await generateImage(
    imagePrompt,
    spec.aspectRatio || '16:9'
  );
  console.log(`   ✅ Image generated: ${model}`);

  // Step 3: Generate caption
  const caption = await generateImageCaption(imagePrompt, spec.concept);
  console.log(`   💬 Caption: ${caption}`);

  return {
    imageUrl: url,
    caption,
    prompt: imagePrompt,
    placement: spec.placement,
    model,
    width,
    height,
  };
}

/**
 * Generate image using available APIs (in priority order)
 *
 * @param prompt - The image generation prompt
 * @param aspectRatio - Desired aspect ratio (default: '16:9')
 */
export async function generateImage(
  prompt: string,
  aspectRatio: '16:9' | '1:1' | '4:3' = '16:9'
): Promise<{
  url: string;
  model: string;
  width: number;
  height: number;
}> {
  // Try fal.ai first (fast + generous free tier)
  if (process.env.FAL_KEY) {
    try {
      return await generateWithFal(prompt, aspectRatio);
    } catch (falError) {
      console.warn('fal.ai failed, trying next option:', falError);
    }
  }

  // Try Hugging Face (free tier)
  if (process.env.HUGGINGFACE_API_KEY) {
    try {
      return await generateWithHuggingFace(prompt, aspectRatio);
    } catch (hfError) {
      console.warn('Hugging Face failed, trying next option:', hfError);
    }
  }

  // Try Replicate (paid but cheap)
  if (process.env.REPLICATE_API_TOKEN) {
    try {
      return await generateWithReplicate(prompt, aspectRatio);
    } catch (repError) {
      console.warn('Replicate failed:', repError);
    }
  }

  throw new Error('No image generation API available or all failed');
}

/**
 * Generate image with fal.ai (FLUX Schnell - fast & high quality)
 */
async function generateWithFal(
  prompt: string,
  aspectRatio: '16:9' | '1:1' | '4:3' = '16:9'
): Promise<{
  url: string;
  model: string;
  width: number;
  height: number;
}> {
  // Map aspect ratio to fal.ai image size
  const sizeMap = {
    '16:9': 'landscape_16_9',
    '1:1': 'square',
    '4:3': 'landscape_4_3',
  };

  const response = await fetch('https://fal.run/fal-ai/flux/schnell', {
    method: 'POST',
    headers: {
      Authorization: `Key ${process.env.FAL_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt,
      image_size: sizeMap[aspectRatio],
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
 * Note: HF Inference API doesn't support custom aspect ratios, always returns 1024x1024
 */
async function generateWithHuggingFace(
  prompt: string,
  aspectRatio: '16:9' | '1:1' | '4:3' = '16:9' // Accepted but not used
): Promise<{
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
async function generateWithReplicate(
  prompt: string,
  aspectRatio: '16:9' | '1:1' | '4:3' = '16:9'
): Promise<{
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
        aspect_ratio: aspectRatio,
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
