/**
 * Buy Credits Button - Buy Me a Coffee Integration
 *
 * Simple payment flow:
 * 1. User clicks button → Opens Buy Me a Coffee page
 * 2. User pays $1 → You get email notification
 * 3. You verify payment → Run admin script to grant 1 credit
 * 4. User can expand again!
 *
 * NO complex Stripe webhooks, checkout flows, or subscription management!
 */

'use client';

export function BuyCreditsButton({
  variant = 'default',
  fullWidth = false,
  className = '',
}: {
  variant?: 'default' | 'large' | 'minimal';
  fullWidth?: boolean;
  className?: string;
}) {
  // Configuration: BMC_USERNAME can be set via environment variable
  // Defaults to 'quilee' if not specified
  const BMC_USERNAME = process.env.NEXT_PUBLIC_BMC_USERNAME || 'quilee';
  const BMC_URL = `https://buymeacoffee.com/${BMC_USERNAME}`;

  const styles: Record<typeof variant, React.CSSProperties> = {
    default: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '8px',
      padding: '10px 20px',
      fontSize: '15px',
      fontWeight: '600',
      backgroundColor: '#FFDD00',
      color: '#000000',
      border: 'none',
      borderRadius: '8px',
      cursor: 'pointer',
      textDecoration: 'none',
      transition: 'transform 0.2s, box-shadow 0.2s',
      boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
    },
    large: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '12px',
      padding: '16px 32px',
      fontSize: '18px',
      fontWeight: '700',
      backgroundColor: '#FFDD00',
      color: '#000000',
      border: 'none',
      borderRadius: '12px',
      cursor: 'pointer',
      textDecoration: 'none',
      transition: 'transform 0.2s, box-shadow 0.2s',
      boxShadow: '0 4px 8px rgba(0, 0, 0, 0.15)',
    },
    minimal: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
      padding: '8px 16px',
      fontSize: '14px',
      fontWeight: '500',
      backgroundColor: 'transparent',
      color: '#FFDD00',
      border: '2px solid #FFDD00',
      borderRadius: '6px',
      cursor: 'pointer',
      textDecoration: 'none',
      transition: 'background-color 0.2s, color 0.2s',
    },
  };

  const baseStyle = styles[variant];
  const widthStyle = fullWidth ? { width: '100%', justifyContent: 'center' } : {};
  const finalStyle = { ...baseStyle, ...widthStyle };

  return (
    <a
      href={BMC_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      style={finalStyle}
      onMouseOver={(e) => {
        if (variant !== 'minimal') {
          e.currentTarget.style.transform = 'translateY(-2px)';
          e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.2)';
        } else {
          e.currentTarget.style.backgroundColor = '#FFDD00';
          e.currentTarget.style.color = '#000000';
        }
      }}
      onMouseOut={(e) => {
        if (variant !== 'minimal') {
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.boxShadow = baseStyle.boxShadow as string;
        } else {
          e.currentTarget.style.backgroundColor = 'transparent';
          e.currentTarget.style.color = '#FFDD00';
        }
      }}
    >
      {/* Buy Me a Coffee Logo (Coffee emoji works great!) */}
      <span style={{ fontSize: variant === 'large' ? '24px' : '20px' }}>☕</span>

      {variant === 'large' ? 'Buy Me a Coffee - $1 per Credit' : 'Buy More Credits ($1)'}
    </a>
  );
}

/**
 * No Credits Banner - Shows when user runs out
 *
 * Displays at top of ideas page when totalRemaining === 0
 */
export function NoCreditsWarning({
  freeUsed = 5,
  totalUsed = 5,
}: {
  freeUsed?: number;
  totalUsed?: number;
}) {
  return (
    <div
      style={{
        padding: '24px',
        backgroundColor: '#FEF3C7',
        border: '2px solid #F59E0B',
        borderRadius: '12px',
        marginBottom: '24px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'start', gap: '16px' }}>
        <div style={{ fontSize: '32px' }}>⚠️</div>

        <div style={{ flex: 1 }}>
          <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '8px', color: '#92400E' }}>
            You've Used All {freeUsed} Free Expansions!
          </h3>

          <p style={{ fontSize: '15px', color: '#78350F', marginBottom: '16px' }}>
            You've generated <strong>{totalUsed} expansions</strong> so far. To continue expanding ideas into blog posts and code projects, purchase more credits for just <strong>$1 per expansion</strong>.
          </p>

          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <BuyCreditsButton variant="large" />

            <div style={{ fontSize: '13px', color: '#92400E' }}>
              <div>✅ Instant access after payment</div>
              <div>✅ Support indie development</div>
            </div>
          </div>
        </div>
      </div>

      <div
        style={{
          marginTop: '16px',
          paddingTop: '16px',
          borderTop: '1px solid #F59E0B',
          fontSize: '13px',
          color: '#92400E',
        }}
      >
        <strong>How it works:</strong> Click the button → Pay $1 via Buy Me a Coffee → I'll verify and grant you 1 credit (usually within a few hours)
      </div>
    </div>
  );
}
