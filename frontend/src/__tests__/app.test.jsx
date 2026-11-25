import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import { ThemeProvider, useTheme } from '../context/ThemeContext';
import { I18nProvider } from '../context/I18nContext';
import NewInvestigationModal from '../components/NewInvestigationModal';
import AuthModal from '../components/AuthModal';
import Discoveries from '../components/Discoveries';

beforeEach(() => {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
});

function ThemeProbe() {
  const { theme, setTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme-val">{theme}</span>
      <button onClick={() => setTheme('dark')}>Set Dark</button>
      <button onClick={() => setTheme('light')}>Set Light</button>
    </div>
  );
}

describe('REVERSE AI 2.0 Frontend & Accessibility Suite', () => {
  it('switches Light and Dark themes on document root', () => {
    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>
    );
    fireEvent.click(screen.getByText('Set Dark'));
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    fireEvent.click(screen.getByText('Set Light'));
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('renders NewInvestigationModal with WCAG dialog semantics and closes on Escape', () => {
    const onClose = vi.fn();
    render(
      <I18nProvider>
        <NewInvestigationModal isOpen={true} onClose={onClose} onCreated={vi.fn()} />
      </I18nProvider>
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders AuthModal with accessible labels, mode toggle, and Escape close', () => {
    const onClose = vi.fn();
    render(<AuthModal isOpen={true} onClose={onClose} onAuthenticated={vi.fn()} />);
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByLabelText(/Email Address/i)).toBeInTheDocument();
    fireEvent.click(screen.getByText(/Need an account\? Register/i));
    expect(screen.getByLabelText(/Full Name/i)).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('filters and searches unusual patterns in Discoveries using plain-language labels', () => {
    const mockInv = {
      investigation: { id: 'INV-TEST-1', status: 'ready' },
      anomalies: [
        {
          id: 'F1',
          title: 'Output decreased after shift',
          metric: 'output_units',
          priority: 'high',
          priority_score: 92,
          severity: 'HIGH',
          p_value: 0.001,
          finding_payload: {
            explanation: 'Output dropped 22%.',
            affected_variables: ['output_units'],
            evidence_strength: 'statistically_supported'
          }
        },
        {
          id: 'F2',
          title: 'Skewed temperature distribution',
          metric: 'temp_c',
          priority: 'low',
          priority_score: 28,
          severity: 'LOW',
          p_value: null,
          finding_payload: {
            explanation: 'Right tail observed.',
            affected_variables: ['temp_c'],
            evidence_strength: 'exploratory'
          }
        }
      ]
    };

    render(<Discoveries investigation={mockInv} onRefresh={vi.fn()} isLoading={false} />);
    expect(screen.getByText('Output decreased after shift')).toBeInTheDocument();
    expect(screen.getByText('Skewed temperature distribution')).toBeInTheDocument();

    fireEvent.click(screen.getByText(/high \(1\)/i));
    expect(screen.getByText('Output decreased after shift')).toBeInTheDocument();
    expect(screen.queryByText('Skewed temperature distribution')).not.toBeInTheDocument();
  });
});
