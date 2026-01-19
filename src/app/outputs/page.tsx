'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Output {
  id: string;
  format: 'blog_post' | 'twitter_thread' | 'github_repo' | 'image';
  content: any;
  created_at: string;
  idea_id: string;
}

export default function OutputsPage() {
  const [outputs, setOutputs] = useState<Output[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    fetchOutputs();
  }, []);

  const fetchOutputs = async () => {
    try {
      const response = await fetch('/api/outputs');
      const data = await response.json();

      if (data.success) {
        setOutputs(data.outputs);
      } else {
        setError(data.error || 'Failed to fetch outputs');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch outputs');
    } finally {
      setLoading(false);
    }
  };

  const filteredOutputs =
    filter === 'all'
      ? outputs
      : outputs.filter((output) => output.format === filter);

  const getFormatIcon = (format: string) => {
    switch (format) {
      case 'blog_post':
        return '📝';
      case 'twitter_thread':
        return '🦣';
      case 'github_repo':
        return '💻';
      case 'image':
        return '🎨';
      default:
        return '✨';
    }
  };

  const getPreview = (output: Output) => {
    switch (output.format) {
      case 'blog_post':
        return output.content.title || 'Untitled Blog Post';
      case 'twitter_thread':
        return `${output.content.totalPosts} posts`;
      case 'github_repo':
        return output.content.repoName || 'Code Project';
      case 'image':
        return output.content.prompt?.substring(0, 60) + '...' || 'AI Image';
      default:
        return 'Generated Content';
    }
  };

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h1 style={{ fontSize: '32px', margin: 0 }}>✨ Generated Outputs</h1>
          <p style={{ color: '#666', marginTop: '5px' }}>
            Content created by your AI agents
          </p>
        </div>
        <Link
          href="/ideas"
          style={{
            padding: '10px 20px',
            backgroundColor: '#0070f3',
            color: 'white',
            textDecoration: 'none',
            borderRadius: '6px',
            fontSize: '14px',
          }}
        >
          ← Back to Ideas
        </Link>
      </div>

      {error && (
        <div
          style={{
            padding: '10px',
            marginBottom: '20px',
            backgroundColor: '#fee',
            border: '1px solid #fcc',
            borderRadius: '4px',
            color: '#c00',
          }}
        >
          {error}
        </div>
      )}

      {/* Filter Tabs */}
      <div style={{ marginBottom: '30px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        {['all', 'blog_post', 'twitter_thread', 'github_repo', 'image'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: '8px 16px',
              fontSize: '14px',
              fontWeight: filter === f ? 'bold' : 'normal',
              backgroundColor: filter === f ? '#0070f3' : '#f3f4f6',
              color: filter === f ? 'white' : '#374151',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
            }}
          >
            {f === 'all' ? '📋 All' : `${getFormatIcon(f)} ${f.charAt(0).toUpperCase() + f.slice(1)}`}
          </button>
        ))}
      </div>

      {/* Outputs Grid */}
      {loading ? (
        <p>Loading outputs...</p>
      ) : filteredOutputs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <p style={{ fontSize: '48px', marginBottom: '20px' }}>🤖</p>
          <h2 style={{ fontSize: '24px', marginBottom: '10px' }}>No outputs yet!</h2>
          <p style={{ color: '#666', marginBottom: '30px' }}>
            {filter === 'all'
              ? 'Add some ideas and click "Expand Now" to generate content'
              : `No ${filter} outputs yet`}
          </p>
          <Link
            href="/ideas"
            style={{
              display: 'inline-block',
              padding: '12px 24px',
              backgroundColor: '#0070f3',
              color: 'white',
              textDecoration: 'none',
              borderRadius: '8px',
              fontSize: '16px',
              fontWeight: 'bold',
            }}
          >
            Go to Ideas
          </Link>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '20px' }}>
          {filteredOutputs.map((output) => (
            <div
              key={output.id}
              style={{
                display: 'block',
                padding: '20px',
                border: '1px solid #ddd',
                borderRadius: '8px',
                backgroundColor: 'white',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '10px' }}>
                <span style={{ fontSize: '32px' }}>{getFormatIcon(output.format)}</span>
                <div style={{ flex: 1 }}>
                  <h3 style={{ fontSize: '18px', margin: 0, fontWeight: 'bold' }}>
                    {getPreview(output)}
                  </h3>
                  <p style={{ fontSize: '14px', color: '#666', margin: '5px 0 0 0' }}>
                    {output.format.charAt(0).toUpperCase() + output.format.slice(1)} • Created{' '}
                    {new Date(output.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <Link
                    href={`/outputs/${output.id}`}
                    style={{
                      padding: '6px 12px',
                      backgroundColor: '#f0f9ff',
                      color: '#0070f3',
                      borderRadius: '6px',
                      fontSize: '14px',
                      fontWeight: 'bold',
                      textDecoration: 'none',
                    }}
                  >
                    View →
                  </Link>
                  <button
                    onClick={async () => {
                      if (!confirm('Are you sure you want to delete this output?')) return;

                      try {
                        const response = await fetch(`/api/outputs/${output.id}`, {
                          method: 'DELETE',
                        });

                        const data = await response.json();

                        if (data.success) {
                          // Refresh the page to show updated list
                          window.location.reload();
                        } else {
                          alert(data.error || 'Failed to delete output');
                        }
                      } catch (err: any) {
                        alert(err.message || 'Failed to delete output');
                      }
                    }}
                    style={{
                      padding: '6px 12px',
                      fontSize: '14px',
                      backgroundColor: '#fee',
                      color: '#c00',
                      border: '1px solid #fcc',
                      borderRadius: '4px',
                      cursor: 'pointer',
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
