export default function Home() {
  return (
    <div style={{ padding: '40px', maxWidth: '800px', margin: '0 auto', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: '48px', marginBottom: '20px' }}>
        Automated Idea Expansion
      </h1>
      <p style={{ fontSize: '20px', color: '#666', marginBottom: '40px' }}>
        Transform your half-formed ideas into polished content automatically
      </p>

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
    </div>
  );
}
