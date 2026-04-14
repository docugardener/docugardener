import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { LiveCodeBlock } from '../components/editor/LiveCodeBlock';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the native fetch API
global.fetch = vi.fn();

// Mock dependencies like lucide-react to speed up shallow renders
vi.mock("lucide-react", () => ({
    CheckCircle2: () => <div data-testid="check-icon" />,
    AlertTriangle: () => <div data-testid="alert-icon" />,
    Loader2: () => <div data-testid="loader-icon" />,
}));

// Mock shiki so we don't need real WASM modules in JSDOM
vi.mock("shiki", () => ({
    codeToHtml: vi.fn().mockResolvedValue("<pre><code>Mocked Shiki HTML</code></pre>")
}));

describe('LiveCodeBlock Component', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders the generic loading state initially', () => {
        // Setup unresolved promise mock
        (global.fetch as any).mockImplementationOnce(() => new Promise(() => { }));

        render(
            <LiveCodeBlock
                owner="test"
                repo="repo"
                filePath="path.ts"
                refSha="main"
            />
        );

        expect(screen.getByText('repo')).toBeInTheDocument();
        expect(screen.getByText('path.ts')).toBeInTheDocument();
        expect(screen.getByTestId('loader-icon')).toBeInTheDocument();
        expect(screen.getByText('Fetching live code...')).toBeInTheDocument();
    });

    it('displays the Drifted badge when status is drifted', async () => {
        (global.fetch as any).mockResolvedValueOnce({
            ok: true,
            json: async () => ({ content: "const a = 1;" })
        });

        render(
            <LiveCodeBlock
                owner="test"
                repo="repo"
                filePath="path.ts"
                refSha="main"
                driftStatus="drifted"
            />
        );

        expect(screen.getByText('Drifted')).toBeInTheDocument();
        expect(screen.getByTestId('alert-icon')).toBeInTheDocument();

        await waitFor(() => {
            expect(screen.queryByTestId('loader-icon')).not.toBeInTheDocument();
        });
    });

    it('displays the Synced badge when status is synced', async () => {
        (global.fetch as any).mockResolvedValueOnce({
            ok: true,
            json: async () => ({ content: "const a = 1;" })
        });

        render(
            <LiveCodeBlock
                owner="test"
                repo="repo"
                filePath="path.ts"
                refSha="main"
                driftStatus="synced"
            />
        );

        expect(screen.getByText('Synced')).toBeInTheDocument();
        expect(screen.getByTestId('check-icon')).toBeInTheDocument();
    });

    it('shows error state when fetch fails', async () => {
        (global.fetch as any).mockResolvedValueOnce({
            ok: false,
            status: 404
        });

        render(
            <LiveCodeBlock
                owner="test"
                repo="repo"
                filePath="path.ts"
                refSha="main"
            />
        );

        await waitFor(() => {
            expect(screen.getByText('Failed to load code snippet (404)')).toBeInTheDocument();
        });
    });
});
