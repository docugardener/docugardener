import asyncio
import click
from pathlib import Path
import sys
from src.core.logging import get_logger
from src.pipeline.analyzer import PRAnalyzer
from src.pipeline.reporter import format_drift_report
from src.cli.license import license_group

# Configure minimal logger for CLI
logger = get_logger("cli")

def run_async(coro):
    return asyncio.run(coro)

@click.group()
def cli():
    """🌱 DocuGardener CLI Tool"""
    pass

cli.add_command(license_group, name="license")

@cli.command()
@click.argument("path", default=".", type=click.Path(exists=True, file_okay=False, dir_okay=True))
@click.option("--fix", is_flag=True, help="Apply suggested fixes automatically")
def check(path, fix):
    """
    Check for documentation drift in the local repository.
    """
    repo_path = Path(path).resolve()
    click.echo(f"🔍 Analyzing drift in: {repo_path}")
    
    analyzer = PRAnalyzer()
    
    try:
        result = run_async(analyzer.analyze_local(repo_path))
        
        if not result.success:
            click.secho(f"❌ Analysis failed: {result.error}", fg="red")
            sys.exit(1)
            
        drift = result.drift_analysis
        if not drift:
             click.secho("✅ No changes detected to analyze.", fg="green")
             return

        # Print Report
        click.echo("\n" + "="*50)
        click.secho(f"Drift Score: {drift.drift_score}/100 ({drift.severity.upper()})", fg="yellow" if drift.drift_score > 0 else "green", bold=True)
        click.echo("="*50 + "\n")
        
        click.echo(drift.summary)
        
        if result.documentation_updates:
            click.echo("\n📝 Suggested Updates:")
            for draft in result.documentation_updates:
                click.secho(f"  - {draft.entity_name} -> {draft.file_path}", fg="cyan")
        
        if fix and result.documentation_updates:
            click.echo("\n🔧 Applying fixes...")
            for draft in result.documentation_updates:
                file_path = repo_path / draft.file_path
                file_path.parent.mkdir(parents=True, exist_ok=True)
                file_path.write_text(draft.content, encoding="utf-8")
                click.echo(f"  ✅ Updated {draft.file_path}")
                
        elif result.documentation_updates:
            click.echo("\n💡 Run with --fix to apply these changes.")
            
        if drift.block_merge:
            sys.exit(1)
            
    except Exception as e:
        click.secho(f"Error: {str(e)}", fg="red")
        sys.exit(1)

if __name__ == "__main__":
    cli()
