import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider, useAuth } from '../src/context/AuthContext.js';
import { StudentsListPage } from '../src/pages/StudentsListPage.js';

describe('Frontend: Tenant Switch Safety & Race Condition Guard (§8.3 & §10)', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          staleTime: 0,
        },
      },
    });
    vi.restoreAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('Guards against stale tenant data: Slow Tenant A response arriving after switch to Tenant B never renders', async () => {
    const tenantA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const tenantB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

    // Mock fetch to simulate network timing:
    // Tenant A takes 150ms to respond
    // Tenant B takes 10ms to respond
    global.fetch = vi.fn(async (input: any, init?: any) => {
      const url = String(input);
      const authHeader = init?.headers?.get?.('Authorization') || '';

      if (authHeader.includes('token-b') || url.includes('tenant-b')) {
        await new Promise((r) => setTimeout(r, 10));
        return new Response(
          JSON.stringify({
            data: [
              {
                id: 'bbbbbbbb-1111-2222-3333-444444444444',
                fullName: 'Alice Nexus (Tenant B)',
                email: 'alice@nexus.edu',
                status: 'active',
                overallScore: 92.5,
                readiness: 'READY',
                version: 1,
                updatedAt: new Date().toISOString(),
              },
            ],
            page: { nextCursor: null, hasMore: false, limit: 20 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // Tenant A is slow!
      await new Promise((r) => setTimeout(r, 150));
      return new Response(
        JSON.stringify({
          data: [
            {
              id: 'aaaaaaaa-1111-2222-3333-444444444444',
              fullName: 'Bob Acme (Tenant A - LEAK)',
              email: 'bob@acme.edu',
              status: 'active',
              overallScore: 50.0,
              readiness: 'DEVELOPING',
              version: 1,
              updatedAt: new Date().toISOString(),
            },
          ],
          page: { nextCursor: null, hasMore: false, limit: 20 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }) as any;

    let switchTenantFn: any;

    function TestWrapper() {
      const { switchTenant } = useAuth();
      switchTenantFn = switchTenant;
      return <StudentsListPage />;
    }

    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <MemoryRouter initialEntries={['/']}>
            <TestWrapper />
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>
    );

    // Initial state is loading
    expect(screen.getByText(/Loading student/i)).toBeInTheDocument();

    // Fast switch to Tenant B before Tenant A's 150ms delay completes
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
      switchTenantFn({
        tenantId: tenantB,
        tenantName: 'Nexus University',
        token: 'token-b',
        role: 'evaluator',
      });
    });

    // Wait for Tenant B data to render
    await waitFor(
      () => {
        expect(screen.getByText('Alice Nexus (Tenant B)')).toBeInTheDocument();
      },
      { timeout: 1000 }
    );

    // Wait past Tenant A's arrival time to ensure A's data never leaks into the DOM
    await new Promise((r) => setTimeout(r, 200));

    // CRITICAL ASSERTION: Tenant A's student data must NEVER be present in the document!
    expect(screen.queryByText('Bob Acme (Tenant A - LEAK)')).not.toBeInTheDocument();
    expect(screen.getByText('Alice Nexus (Tenant B)')).toBeInTheDocument();
  });
});
