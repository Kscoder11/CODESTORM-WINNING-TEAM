import fnmatch
import yaml
from pathlib import Path
from governor.config import settings

class ResourceRegistry:
    def __init__(self, resources_path: Path = settings.RESOURCES_PATH):
        self.resources_path = resources_path
        self.rules = []
        self.reload()

    def reload(self):
        """Reload resource metadata mapping rules from YAML file."""
        if not self.resources_path.exists():
            self.rules = []
            return
            
        try:
            with open(self.resources_path, "r", encoding="utf-8") as f:
                data = yaml.safe_load(f) or {}
                self.rules = data.get("resources", [])
        except Exception as e:
            # Last-good-wins on reload error; retain existing rules if any
            if not hasattr(self, "rules") or self.rules is None:
                self.rules = []

    def resolve(self, target: str) -> dict:
        """
        Resolve resource metadata (trust, sensitivity, env) for target.
        Unknown resources default conservatively to:
        trust = untrusted, sensitivity = restricted, env = prod
        """
        norm_target = str(target)
        
        for rule in self.rules:
            pattern = rule.get("pattern", "")
            if fnmatch.fnmatch(norm_target, pattern):
                return {
                    "trust": rule.get("trust", "untrusted"),
                    "sensitivity": rule.get("sensitivity", "restricted"),
                    "env": rule.get("env", "prod")
                }
                
        # Conservative Default Fallback
        return {
            "trust": "untrusted",
            "sensitivity": "restricted",
            "env": "prod"
        }

registry = ResourceRegistry()
