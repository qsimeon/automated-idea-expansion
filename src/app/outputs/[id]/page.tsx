'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { use } from 'react';

interface Output {
  id: string;
  format: 'blog_post' | 'twitter_thread' | 'github_repo' | 'image';
  content: any;
  created_at: string;
}

export default function OutputViewerPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const [output, setOutput] = useState<Output | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchOutput();
  }, []);

  const fetchOutput = async () => {
    try {
      const response = await fetch(`/api/outputs/${resolvedParams.id}`);
      const data = await response.json();

      if (data.success) {
        setOutput(data.output);
      } else {
        setError(data.error || 'Failed to fetch output');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch output');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <p>Loading...</p>
      </div>
    );
  }

  if (error || !output) {
    return (
      <div style={{ padding: '40px', maxWidth: '800px', margin: '0 auto' }}>
        <div
          style={{
            padding: '20px',
            backgroundColor: '#fee',
            border: '1px solid #fcc',
            borderRadius: '8px',
            color: '#c00',
          }}
        >
          {error || 'Output not found'}
        </div>
        <Link
          href="/outputs"
          style={{
            display: 'inline-block',
            marginTop: '20px',
            padding: '10px 20px',
            backgroundColor: '#0070f3',
            color: 'white',
            textDecoration: 'none',
            borderRadius: '6px',
          }}
        >
          ← Back to Outputs
        </Link>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px', maxWidth: '900px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '30px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Link
          href="/outputs"
          style={{
            padding: '8px 16px',
            backgroundColor: '#f3f4f6',
            color: '#374151',
            textDecoration: 'none',
            borderRadius: '6px',
            fontSize: '14px',
          }}
        >
          ← Back
        </Link>
        <span style={{ fontSize: '14px', color: '#999' }}>
          Created {new Date(output.created_at).toLocaleDateString()} at{' '}
          {new Date(output.created_at).toLocaleTimeString()}
        </span>
      </div>

      {/* Format-specific viewer */}
      {output.format === 'blog_post' && <BlogViewer content={output.content} />}
      {output.format === 'twitter_thread' && <MastodonViewer content={output.content} />}
      {output.format === 'github_repo' && <CodeViewer content={output.content} />}
      {output.format === 'image' && <ImageViewer content={output.content} />}
    </div>
  );
}

// Blog Post Viewer
function BlogViewer({ content }: { content: any }) {
  return (
    <article
      style={{
        backgroundColor: 'white',
        padding: '40px',
        borderRadius: '8px',
        border: '1px solid #e5e7eb',
      }}
    >
      <div style={{ marginBottom: '30px', paddingBottom: '20px', borderBottom: '2px solid #e5e7eb' }}>
        <h1 style={{ fontSize: '36px', margin: '0 0 15px 0', lineHeight: '1.2' }}>{content.title}</h1>
        <div style={{ display: 'flex', gap: '20px', fontSize: '14px', color: '#666' }}>
          <span>📝 Blog Post</span>
          <span>📊 {content.wordCount} words</span>
          <span>⏱️ {content.readingTimeMinutes} min read</span>
        </div>
      </div>

      <div
        style={{
          fontSize: '18px',
          lineHeight: '1.8',
          color: '#374151',
        }}
        dangerouslySetInnerHTML={{
          __html: parseMarkdown(content.markdown),
        }}
      />
    </article>
  );
}

// Mastodon Thread Viewer
function MastodonViewer({ content }: { content: any }) {
  return (
    <div>
      <h1 style={{ fontSize: '28px', marginBottom: '10px' }}>🦣 Mastodon Thread</h1>
      <p style={{ color: '#666', marginBottom: '30px' }}>
        {content.totalPosts} posts • Ready to post!
      </p>

      <div style={{ display: 'grid', gap: '15px' }}>
        {content.posts.map((post: any) => (
          <div
            key={post.order}
            style={{
              backgroundColor: 'white',
              padding: '20px',
              borderRadius: '8px',
              border: '1px solid #e5e7eb',
            }}
          >
            <div style={{ fontSize: '12px', color: '#999', marginBottom: '10px' }}>
              Post {post.order} of {content.totalPosts}
            </div>
            <p style={{ fontSize: '16px', margin: 0, whiteSpace: 'pre-wrap' }}>{post.text}</p>
            <div style={{ marginTop: '10px', fontSize: '12px', color: '#999' }}>
              {post.text.length} / 500 characters
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Code Project Viewer
function CodeViewer({ content }: { content: any }) {
  return (
    <div>
      <h1 style={{ fontSize: '28px', marginBottom: '10px' }}>💻 {content.repoName}</h1>
      <p style={{ color: '#666', marginBottom: '30px' }}>{content.description}</p>

      <div
        style={{
          display: 'inline-block',
          padding: '6px 12px',
          backgroundColor: '#f0f9ff',
          color: '#0070f3',
          borderRadius: '6px',
          fontSize: '14px',
          fontWeight: 'bold',
          marginBottom: '30px',
        }}
      >
        {content.type === 'nodejs' ? '⚡ Node.js' : '🐍 Python'}
      </div>

      <div style={{ display: 'grid', gap: '20px' }}>
        {content.files.map((file: any, index: number) => (
          <div
            key={index}
            style={{
              backgroundColor: 'white',
              borderRadius: '8px',
              border: '1px solid #e5e7eb',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '12px 20px',
                backgroundColor: '#f9fafb',
                borderBottom: '1px solid #e5e7eb',
                fontFamily: 'monospace',
                fontSize: '14px',
                fontWeight: 'bold',
              }}
            >
              {file.path}
            </div>
            <pre
              style={{
                padding: '20px',
                margin: 0,
                overflow: 'auto',
                fontSize: '14px',
                lineHeight: '1.6',
                backgroundColor: '#1e1e1e',
                color: '#d4d4d4',
              }}
            >
              {file.content}
            </pre>
          </div>
        ))}
      </div>
    </div>
  );
}

// AI Image Viewer
function ImageViewer({ content }: { content: any }) {
  return (
    <div>
      <h1 style={{ fontSize: '28px', marginBottom: '10px' }}>🎨 AI-Generated Image</h1>
      <p style={{ color: '#666', marginBottom: '30px' }}>
        Model: {content.model} • {content.width} × {content.height}
      </p>

      <div
        style={{
          backgroundColor: 'white',
          padding: '20px',
          borderRadius: '8px',
          border: '1px solid #e5e7eb',
          marginBottom: '30px',
        }}
      >
        <h3 style={{ fontSize: '16px', marginBottom: '10px' }}>Prompt:</h3>
        <p style={{ fontSize: '14px', color: '#666', margin: 0, fontStyle: 'italic' }}>
          "{content.prompt}"
        </p>
      </div>

      <div style={{ textAlign: 'center' }}>
        <img
          src={content.imageUrl}
          alt={content.prompt}
          style={{
            maxWidth: '100%',
            height: 'auto',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          }}
        />
      </div>
    </div>
  );
}

// Simple markdown parser (for blog posts)
function parseMarkdown(markdown: string): string {
  let html = markdown;

  // Headers
  html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
  html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');

  // Bold
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

  // Italic
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');

  // Code blocks
  html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');

  // Inline code
  html = html.replace(/`(.*?)`/g, '<code>$1</code>');

  // Links
  html = html.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank">$1</a>');

  // Paragraphs
  html = html.replace(/\n\n/g, '</p><p>');
  html = '<p>' + html + '</p>';

  // Clean up
  html = html.replace(/<p><\/p>/g, '');
  html = html.replace(/<p>(<h[1-6]>)/g, '$1');
  html = html.replace(/(<\/h[1-6]>)<\/p>/g, '$1');

  return html;
}
