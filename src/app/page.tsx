export default function Home() {
  return (
    <div style={{ padding: '40px', maxWidth: '800px', margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: '48px', marginBottom: '20px' }}>
        Automated Idea Expansion
      </h1>
      <p style={{ fontSize: '20px', color: '#666', marginBottom: '30px' }}>
        Transform your half-formed ideas into polished content automatically
      </p>

      <div style={{ padding: '20px', backgroundColor: '#f0fdf4', border: '2px solid #86efac', borderRadius: '8px', marginBottom: '30px' }}>
        <h3 style={{ margin: '0 0 10px 0', color: '#166534' }}>✅ Phase 4 Complete - Multi-Agent AI Pipeline Live!</h3>
        <p style={{ margin: 0, color: '#15803d' }}>
          The AI agent system is working! You select an idea → Router Agent decides format → Creator Agent generates content. Produces blog posts with images and social posts, or complete code projects with GitHub repos.
        </p>
      </div>

      <div style={{ marginTop: '40px' }}>
        <h2 style={{ fontSize: '24px', marginBottom: '15px' }}>🚀 Try It Out:</h2>
        <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
          <a
            href="/ideas"
            style={{
              display: 'inline-block',
              padding: '15px 30px',
              fontSize: '18px',
              fontWeight: 'bold',
              backgroundColor: '#0070f3',
              color: 'white',
              textDecoration: 'none',
              borderRadius: '8px',
            }}
          >
            💡 Manage Ideas
          </a>
          <a
            href="/outputs"
            style={{
              display: 'inline-block',
              padding: '15px 30px',
              fontSize: '18px',
              fontWeight: 'bold',
              backgroundColor: '#10b981',
              color: 'white',
              textDecoration: 'none',
              borderRadius: '8px',
            }}
          >
            ✨ View Outputs
          </a>
        </div>
      </div>

      <div style={{ marginTop: '60px', paddingTop: '30px', borderTop: '1px solid #ddd' }}>
        <h2 style={{ fontSize: '24px', marginBottom: '15px' }}>📋 Roadmap:</h2>
        <ul style={{ lineHeight: '2' }}>
          <li><strong>Phase 1:</strong> Foundation ✅ Done!</li>
          <li><strong>Phase 2:</strong> Ideas Management ✅ Done!</li>
          <li><strong>Phase 4:</strong> Multi-Agent AI System ✅ Done!</li>
          <li><strong>Phase 5 (Current):</strong> Outputs Viewer & Real-time Progress</li>
          <li><strong>Phase 6:</strong> Publishing to External Platforms (GitHub, Mastodon)</li>
          <li><strong>Phase 7:</strong> User Authentication (Clerk)</li>
        </ul>
      </div>
    </div>
  );
}
