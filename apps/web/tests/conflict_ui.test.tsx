import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConflictDialog, ReadinessBadge } from '../src/components/StateViews.js';

describe('Frontend: UI States & Conflict Resolution (§8.4 & §9.5)', () => {
  it('Renders ConflictDialog with currentVersion and triggers onReload callback', () => {
    const onReload = vi.fn();
    const onCancel = vi.fn();

    const { rerender } = render(
      <ConflictDialog
        isOpen={false}
        currentVersion={3}
        onReload={onReload}
        onCancel={onCancel}
      />
    );

    expect(screen.queryByText(/Conflict Detected/i)).not.toBeInTheDocument();

    rerender(
      <ConflictDialog
        isOpen={true}
        currentVersion={3}
        onReload={onReload}
        onCancel={onCancel}
      />
    );

    expect(screen.getByText(/Conflict Detected/i)).toBeInTheDocument();
    expect(screen.getByText(/current version is 3/i)).toBeInTheDocument();

    fireEvent.click(screen.getByText(/Reload Latest Data/i));
    expect(onReload).toHaveBeenCalledTimes(1);
  });

  it('Renders all readiness badge states correctly', () => {
    const { rerender } = render(<ReadinessBadge readiness="READY" score={85} />);
    expect(screen.getByText(/Ready/i)).toBeInTheDocument();
    expect(screen.getByText(/85.0%/i)).toBeInTheDocument();

    rerender(<ReadinessBadge readiness="INCOMPLETE" score={null} />);
    expect(screen.getByText(/Incomplete/i)).toBeInTheDocument();

    rerender(<ReadinessBadge readiness="NEARLY_READY" score={72.5} />);
    expect(screen.getByText(/Nearly Ready/i)).toBeInTheDocument();

    rerender(<ReadinessBadge readiness="DEVELOPING" score={55} />);
    expect(screen.getByText(/Developing/i)).toBeInTheDocument();

    rerender(<ReadinessBadge readiness="NEEDS_PREPARATION" score={42} />);
    expect(screen.getByText(/Needs Preparation/i)).toBeInTheDocument();
  });
});
