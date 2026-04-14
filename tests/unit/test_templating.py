from src.pipeline.analyzer import PRAnalysisResult, DriftAnalysis
from src.pipeline.reporter import format_drift_report

def test_custom_template():
    # Mock Result
    drift = DriftAnalysis(
        drift_score=85,
        severity="critical",
        required_updates=[],
        block_merge=True,
        summary="Major drift detected"
    )
    result = PRAnalysisResult(
        pr_number=1,
        repo_full_name="test/repo",
        drift_analysis=drift,
    )
    
    # Custom Template
    template = "## 🎨 Custom Template\nDrift: {{drift_score}}\nSummary: {{summary}}"
    
    # Run
    output = format_drift_report(result, template=template)
    
    print("\n--- Output ---")
    print(output)
    print("--------------\n")
    
    assert "🎨 Custom Template" in output
    assert "Drift: 85" in output
    assert "Summary: Major drift detected" in output

if __name__ == "__main__":
    test_custom_template()
    print("✅ Template Test Passed")
