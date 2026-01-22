'use client';

import { useState, useEffect } from 'react';
import { NoCreditsRanner } from '@/components/credits/buy-credits-button';

interface Idea {
  id: string;
  title: string;
  description: string | null;
  status: string;
  created_at: string;
  output_id: string | null;
  output_format: string | null;
  output_created_at: string | null;
}

interface Usage {
  freeRemaining: number;
  paidRemaining: number;
  totalRemaining: number;
  totalUsed: number;
  freeUsed: number;
  paidUsed: number;
}

export default function IdeasPage() {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Form state - just one field!
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Expand state
  const [expanding, setExpanding] = useState(false);
  const [expandingId, setExpandingId] = useState<string | null>(null);

  // Usage state
  const [usage, setUsage] = useState<Usage | null>(null);
  const [usageLoading, setUsageLoading] = useState(true);

  // Fetch ideas and usage on mount
  useEffect(() => {
    fetchIdeas();
    fetchUsage();
  }, []);

  const fetchIdeas = async () => {
    try {
      const response = await fetch('/api/ideas');
      const data = await response.json();

      if (data.success) {
        setIdeas(data.ideas);
      } else {
        setError(data.error || 'Failed to fetch ideas');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch ideas');
    } finally {
      setLoading(false);
    }
  };

  const fetchUsage = async () => {
    try {
      const response = await fetch('/api/usage');
      const data = await response.json();

      if (data.success) {
        setUsage(data.usage);
      }
    } catch (err: any) {
      console.error('Failed to fetch usage:', err);
      // Don't show error to user, just silently fail
    } finally {
      setUsageLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      const response = await fetch('/api/ideas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });

      const data = await response.json();

      if (data.success) {
        // Clear form
        setContent('');

        // Refresh ideas list
        fetchIdeas();
      } else {
        setError(data.error || 'Failed to create idea');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to create idea');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this idea?')) return;

    try {
      const response = await fetch(`/api/ideas/${id}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (data.success) {
        fetchIdeas();
      } else {
        alert(data.error || 'Failed to delete idea');
      }
    } catch (err: any) {
      alert(err.message || 'Failed to delete idea');
    }
  };

  const handleExpand = async (specificIdeaId?: string) => {
    setExpanding(true);
    setExpandingId(specificIdeaId || null);
    setError('');
    setSuccess('');

    try {
      const response = await fetch('/api/expand', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ideaId: specificIdeaId || undefined,
        }),
      });

      const data = await response.json();

      if (data.success) {
        if (data.outputId) {
          // Show success with link to view output
          const formatEmoji =
            data.content?.format === 'blog_post' ? '📝' :
            data.content?.format === 'github_repo' ? '💻' : '✨';

          setSuccess(
            `${formatEmoji} Success! Generated ${data.content?.format || 'content'}: ${data.content?.preview || 'View it now!'}`
          );

          // Redirect to output after a brief delay
          setTimeout(() => {
            window.location.href = `/outputs/${data.outputId}`;
          }, 1500);
        } else {
          setSuccess(data.message || 'Expansion complete!');
        }

        // Refresh ideas to update status
        fetchIdeas();

        // Refresh usage to show updated credits
        fetchUsage();
      } else {
        setError(data.error || 'Failed to expand idea');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to expand idea');
    } finally {
      setExpanding(false);
      setExpandingId(null);
    }
  };

  const pendingIdeas = ideas.filter((idea) => idea.status === 'pending');
  const expandedIdeas = ideas.filter((idea) => idea.status === 'expanded');

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '32px', marginBottom: '10px' }}>💡 My Ideas</h1>
      <p style={{ color: '#666', marginBottom: '30px' }}>
        Drop your raw thoughts here - the AI will expand them later
      </p>

      {/* No Credits Banner */}
      {!usageLoading && usage && usage.totalRemaining === 0 && (
        <NoCreditsRanner
          freeUsed={usage.freeUsed}
          totalUsed={usage.totalUsed}
        />
      )}

      {/* Credits Display */}
      {!usageLoading && usage && usage.totalRemaining > 0 && (
        <div style={{
          padding: '12px 20px',
          backgroundColor: '#f0f9ff',
          border: '1px solid #0ea5e9',
          borderRadius: '8px',
          marginBottom: '24px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <span style={{ fontSize: '20px' }}>💳</span>
          <div>
            <strong style={{ color: '#0369a1' }}>
              {usage.totalRemaining} credit{usage.totalRemaining === 1 ? '' : 's'} remaining
            </strong>
            <span style={{ color: '#666', fontSize: '14px', marginLeft: '8px' }}>
              ({usage.freeRemaining} free + {usage.paidRemaining} paid)
            </span>
          </div>
        </div>
      )}

      {error && (
        <div style={{ padding: '10px', marginBottom: '20px', backgroundColor: '#fee', border: '1px solid #fcc', borderRadius: '4px', color: '#c00' }}>
          {error}
        </div>
      )}

      {success && (
        <div style={{ padding: '10px', marginBottom: '20px', backgroundColor: '#d1fae5', border: '1px solid #86efac', borderRadius: '4px', color: '#065f46' }}>
          {success}
        </div>
      )}

      {/* Simple Create Form - Just One Text Box! */}
      <div style={{ marginBottom: '40px', padding: '20px', border: '2px solid #0070f3', borderRadius: '8px', backgroundColor: '#f0f9ff' }}>
        <h2 style={{ fontSize: '20px', marginBottom: '15px' }}>➕ Add New Idea</h2>
        <form onSubmit={handleSubmit}>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Paste your idea here... Could be a sentence, a paragraph, or just a few words.&#10;&#10;Examples:&#10;• 'How do people solve anagram puzzles efficiently?'&#10;• 'Build a Chrome extension that highlights AI-generated text'&#10;• 'Explain transformer architecture to a 10-year-old'"
            required
            rows={6}
            style={{
              width: '100%',
              padding: '12px',
              fontSize: '16px',
              border: '1px solid #ccc',
              borderRadius: '4px',
              fontFamily: 'inherit',
              marginBottom: '15px',
              resize: 'vertical',
            }}
          />

          <button
            type="submit"
            disabled={submitting || !content.trim()}
            style={{
              padding: '12px 24px',
              fontSize: '16px',
              fontWeight: 'bold',
              backgroundColor: submitting ? '#ccc' : '#0070f3',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: submitting ? 'not-allowed' : 'pointer',
            }}
          >
            {submitting ? 'Saving...' : 'Save Idea'}
          </button>
        </form>
      </div>

      {/* Info banner for pending ideas */}
      {pendingIdeas.length > 0 && (
        <div style={{ marginBottom: '40px', padding: '20px', border: '2px solid #10b981', borderRadius: '8px', backgroundColor: '#ecfdf5' }}>
          <h2 style={{ fontSize: '20px', marginBottom: '10px' }}>💡 Ready to Expand</h2>
          <p style={{ color: '#666', marginBottom: '0' }}>
            You have {pendingIdeas.length} pending {pendingIdeas.length === 1 ? 'idea' : 'ideas'}. Click <strong>"✨ Expand This"</strong> on any idea below to generate a blog post or code project!
          </p>
        </div>
      )}

      {/* Ideas List - Organized by Status */}
      {loading ? (
        <p>Loading ideas...</p>
      ) : ideas.length === 0 ? (
        <div>
          <h2 style={{ fontSize: '24px', marginBottom: '15px' }}>
            📋 Your Ideas (0)
          </h2>
          <p style={{ color: '#666', fontStyle: 'italic' }}>
            No ideas yet. Add your first one above! ☝️
          </p>
        </div>
      ) : (
        <>
          {/* Expanded Ideas Section */}
          {expandedIdeas.length > 0 && (
            <div style={{ marginBottom: '40px' }}>
              <h2 style={{ fontSize: '24px', marginBottom: '15px', color: '#065f46' }}>
                ✨ Expanded Ideas ({expandedIdeas.length})
              </h2>
              <div style={{ display: 'grid', gap: '20px' }}>
                {expandedIdeas.map((idea) => (
                  <div
                    key={idea.id}
                    style={{
                      padding: '20px',
                      border: '2px solid #86efac',
                      borderRadius: '8px',
                      backgroundColor: '#f0fdf4',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                      <h3 style={{ fontSize: '18px', margin: 0, fontWeight: 'bold' }}>
                        {idea.title}
                      </h3>
                      <span
                        style={{
                          padding: '4px 8px',
                          fontSize: '12px',
                          borderRadius: '4px',
                          fontWeight: 'bold',
                          backgroundColor: '#d1fae5',
                          color: '#065f46',
                        }}
                      >
                        expanded
                      </span>
                    </div>

                    {idea.description && idea.description !== idea.title && (
                      <p style={{ color: '#666', marginTop: '10px', marginBottom: '0' }}>
                        {idea.description}
                      </p>
                    )}

                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginTop: '15px',
                        paddingTop: '15px',
                        borderTop: '1px solid #86efac',
                      }}
                    >
                      <span style={{ fontSize: '14px', color: '#666' }}>
                        Added: {new Date(idea.created_at).toLocaleDateString()}
                        {idea.output_format && (
                          <span style={{ marginLeft: '12px' }}>
                            • Format: {
                              idea.output_format === 'blog_post' ? '📝 Blog' :
                              idea.output_format === 'twitter_thread' ? '🦣 Twitter Thread' :
                              idea.output_format === 'github_repo' ? '💻 Code' : idea.output_format
                            }
                          </span>
                        )}
                      </span>
                      <div style={{ display: 'flex', gap: '10px' }}>
                        {idea.output_id && (
                          <a
                            href={`/outputs/${idea.output_id}`}
                            style={{
                              padding: '6px 12px',
                              fontSize: '14px',
                              backgroundColor: '#10b981',
                              color: 'white',
                              textDecoration: 'none',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              display: 'inline-block',
                            }}
                          >
                            👁️ View Output
                          </a>
                        )}
                        <button
                          onClick={() => handleDelete(idea.id)}
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
            </div>
          )}

          {/* Pending Ideas Section */}
          {pendingIdeas.length > 0 && (
            <div>
              <h2 style={{ fontSize: '24px', marginBottom: '15px', color: '#92400e' }}>
                ⏳ Pending Ideas ({pendingIdeas.length})
              </h2>
              <div style={{ display: 'grid', gap: '20px' }}>
                {pendingIdeas.map((idea) => (
                  <div
                    key={idea.id}
                    style={{
                      padding: '20px',
                      border: '2px solid #fef3c7',
                      borderRadius: '8px',
                      backgroundColor: '#fffbeb',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                      <h3 style={{ fontSize: '18px', margin: 0, fontWeight: 'bold' }}>
                        {idea.title}
                      </h3>
                      <span
                        style={{
                          padding: '4px 8px',
                          fontSize: '12px',
                          borderRadius: '4px',
                          fontWeight: 'bold',
                          backgroundColor: '#fef3c7',
                          color: '#92400e',
                        }}
                      >
                        pending
                      </span>
                    </div>

                    {idea.description && idea.description !== idea.title && (
                      <p style={{ color: '#666', marginTop: '10px', marginBottom: '0' }}>
                        {idea.description}
                      </p>
                    )}

                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginTop: '15px',
                        paddingTop: '15px',
                        borderTop: '1px solid #fef3c7',
                      }}
                    >
                      <span style={{ fontSize: '14px', color: '#666' }}>
                        Added: {new Date(idea.created_at).toLocaleDateString()}
                      </span>
                      <div style={{ display: 'flex', gap: '10px' }}>
                        <button
                          onClick={() => handleExpand(idea.id)}
                          disabled={expanding && expandingId === idea.id}
                          style={{
                            padding: '6px 12px',
                            fontSize: '14px',
                            backgroundColor: expanding && expandingId === idea.id ? '#ccc' : '#10b981',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: expanding && expandingId === idea.id ? 'not-allowed' : 'pointer',
                          }}
                        >
                          {expanding && expandingId === idea.id ? '⏳ Expanding...' : '✨ Expand This'}
                        </button>
                        <button
                          onClick={() => handleDelete(idea.id)}
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
            </div>
          )}
        </>
      )}
    </div>
  );
}
