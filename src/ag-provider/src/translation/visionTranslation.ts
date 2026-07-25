export interface OpenAIContentPartText {
  type: 'text';
  text: string;
}

export interface OpenAIContentPartImage {
  type: 'image_url';
  image_url: {
    url: string;
    detail?: 'auto' | 'low' | 'high';
  };
}

export type OpenAIContentPart = OpenAIContentPartText | OpenAIContentPartImage;

export interface ConnectInlineData {
  mimeType?: string;
  mime_type?: string;
  data: string; // Base64 encoded string
}

/**
 * Translates ConnectRPC parts (text + inlineData) into OpenAI multimodal content array
 */
export function translateConnectPartsToOpenAIContent(parts: any[]): string | OpenAIContentPart[] {
  if (!Array.isArray(parts) || parts.length === 0) {
    return '';
  }

  const hasImage = parts.some(p => p && (p.inlineData || p.inline_data || p.image_url || p.imageUrl));

  // If text-only, return plain string for efficiency
  if (!hasImage) {
    return parts
      .map(p => {
        if (typeof p === 'string') return p;
        if (p?.text) return p.text;
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }

  // Multimodal content array
  const contentArray: OpenAIContentPart[] = [];

  for (const part of parts) {
    if (typeof part === 'string') {
      contentArray.push({ type: 'text', text: part });
    } else if (part.text) {
      contentArray.push({ type: 'text', text: part.text });
    } else if (part.inlineData || part.inline_data) {
      const inlineData = part.inlineData || part.inline_data;
      const mimeType = inlineData.mimeType || inlineData.mime_type || 'image/png';
      const base64Data = inlineData.data || '';
      
      const dataUri = base64Data.startsWith('data:') 
        ? base64Data 
        : `data:${mimeType};base64,${base64Data}`;

      contentArray.push({
        type: 'image_url',
        image_url: {
          url: dataUri,
          detail: 'auto'
        }
      });
    }
  }

  return contentArray;
}
