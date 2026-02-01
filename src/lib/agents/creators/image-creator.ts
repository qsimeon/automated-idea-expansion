import { ChatOpenAI } from '@langchain/openai';
import type { ImageSpec, GeneratedImage } from '../types';
import { MODEL_USE_CASES } from '@/lib/config/models';

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
    modelName: MODEL_USE_CASES.imagePrompt,
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
    modelName: MODEL_USE_CASES.imagePrompt,
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
 * Priority order (highest quality first):
 * 1. Google Gemini Imagen 3 (newest, highest quality)
 * 2. Replicate FLUX Dev (expensive but best quality)
 * 3. fal.ai FLUX Schnell (fast + cheap)
 * 4. Hugging Face SDXL (free tier)
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
  // ⭐ TASK 4: Try Gemini first (newest, highest quality model)
  if (process.env.GOOGLE_API_KEY) {
    try {
      console.log('   🎨 Trying Gemini Imagen 3...');
      return await generateWithGemini(prompt, aspectRatio);
    } catch (geminiError: any) {
      console.warn(
        `   ⚠️  Gemini failed: ${geminiError.message || String(geminiError)}`
      );
      console.log('   🔄 Falling back to next provider...');
    }
  }

  // Try fal.ai (fast + generous free tier)
  if (process.env.FAL_KEY) {
    try {
      console.log('   🎨 Trying fal.ai FLUX Schnell...');
      return await generateWithFal(prompt, aspectRatio);
    } catch (falError: any) {
      console.warn(
        `   ⚠️  fal.ai failed: ${falError.message || String(falError)}`
      );
      console.log('   🔄 Falling back to next provider...');
    }
  }

  // Try Replicate (paid but high quality)
  if (process.env.REPLICATE_API_TOKEN) {
    try {
      console.log('   🎨 Trying Replicate FLUX...');
      return await generateWithReplicate(prompt, aspectRatio);
    } catch (repError: any) {
      console.warn(
        `   ⚠️  Replicate failed: ${repError.message || String(repError)}`
      );
      console.log('   🔄 Falling back to next provider...');
    }
  }

  // Try Hugging Face (free tier)
  if (process.env.HUGGINGFACE_API_KEY) {
    try {
      console.log('   🎨 Trying Hugging Face SDXL...');
      return await generateWithHuggingFace(prompt, aspectRatio);
    } catch (hfError: any) {
      console.warn(
        `   ⚠️  Hugging Face failed: ${hfError.message || String(hfError)}`
      );
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

/**
 * Generate image with Google Gemini Imagen 3 (Newest model - highest quality)
 *
 * Gemini Imagen 3 is Google's latest image generation model with:
 * - Highest visual quality and detail
 * - Best understanding of complex prompts
 * - Native aspect ratio support
 * - Consistent, photorealistic results
 */
async function generateWithGemini(
  prompt: string,
  aspectRatio: '16:9' | '1:1' | '4:3' = '16:9'
): Promise<{
  url: string;
  model: string;
  width: number;
  height: number;
}> {
  // Pre-flight validation: Check API key
  if (!process.env.GOOGLE_API_KEY) {
    console.error('   ❌ GOOGLE_API_KEY not set in environment variables');
    throw new Error(
      'GOOGLE_API_KEY environment variable not set. ' +
      'Get your API key from: https://ai.google.dev/ and add it to .env.local'
    );
  }

  // Validate API key format (basic check)
  const apiKey = process.env.GOOGLE_API_KEY;
  if (apiKey.length < 20) {
    console.error('   ❌ GOOGLE_API_KEY appears invalid (too short)');
    throw new Error(
      'GOOGLE_API_KEY appears invalid. Expected format: AIza... ' +
      'Check your API key at: https://ai.google.dev/'
    );
  }

  // Dynamically import to avoid dependency issues if SDK not installed
  let GoogleGenerativeAI: any;
  try {
    // eslint-disable-next-line global-require
    GoogleGenerativeAI = require('@google/generative-ai').GoogleGenerativeAI;
  } catch (error) {
    console.error('   ❌ Google Generative AI SDK not installed');
    throw new Error(
      'Google Generative AI SDK not installed. Install with: npm install @google/generative-ai'
    );
  }

  const genAI = new GoogleGenerativeAI(apiKey);

  // Dimension mapping for aspect ratios
  const dimensionMap = {
    '16:9': { width: 1792, height: 1024 },
    '1:1': { width: 1024, height: 1024 },
    '4:3': { width: 1024, height: 768 },
  };

  const dimensions = dimensionMap[aspectRatio];

  console.log(`   🎨 Gemini config: model=imagen-3.0, dimensions=${dimensions.width}x${dimensions.height}`);

  try {
    // Use Imagen 3.0 (latest model)
    const model = genAI.getGenerativeModel({
      model: 'imagen-3.0-generate-001',
    });

    console.log('   📡 Calling Gemini API...');
    const result = await model.generateImages({
      prompt: prompt,
      numberOfImages: 1,
      ...dimensions,
    });

    console.log('   ✅ Gemini API responded');

    const generatedImage = result.images[0];

    if (!generatedImage || !generatedImage.url) {
      console.error('   ❌ No image URL in Gemini response', {
        responseKeys: result ? Object.keys(result) : [],
        imagesLength: result?.images?.length,
      });
      throw new Error('No image URL in Gemini response');
    }

    console.log('   ✅ Image URL extracted successfully');

    return {
      url: generatedImage.url,
      model: 'imagen-3.0 (Google Gemini)',
      width: dimensions.width,
      height: dimensions.height,
    };
  } catch (error: any) {
    // Enhanced error logging with actionable diagnostics
    console.error('   ❌ Gemini image generation error:', {
      errorType: error?.constructor?.name,
      errorMessage: error?.message,
      errorCode: error?.code,
      statusCode: error?.response?.status,
      statusText: error?.response?.statusText,
    });

    // Provide actionable error messages based on error type
    let actionableMessage = error.message || String(error);

    // Check for common error patterns
    if (error.message?.includes('API key')) {
      actionableMessage = 'API key authentication failed. Verify your GOOGLE_API_KEY is correct.';
    } else if (error.message?.includes('quota') || error.message?.includes('rate limit')) {
      actionableMessage = 'API quota exceeded or rate limited. Check your Google Cloud quota.';
    } else if (error.message?.includes('permission') || error.message?.includes('403')) {
      actionableMessage = 'Permission denied. Ensure Imagen API is enabled in Google Cloud Console.';
    } else if (error.message?.includes('not found') || error.message?.includes('404')) {
      actionableMessage = 'Model not found. Verify imagen-3.0-generate-001 is available in your region.';
    } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      actionableMessage = 'Network error connecting to Google API. Check your internet connection.';
    }

    throw new Error(`Gemini failed: ${actionableMessage}`);
  }
}
