# -*- coding: utf-8 -*-
"""Insert Blog nav link after CLAT GK & CA across HTML pages."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent

# Patterns: (marker_end_of_gk_line_snippet, blog_link_to_insert_after_gk_block)
# We find GK link line and insert Blog before Contact us if Blog not already present.

ROOT_BLOG = (
    '        <a class="site-nav__link" href="blog.html"><img src="image/blog.png" alt="" '
    'class="site-nav__link-icon" width="18" height="18" loading="lazy" /> Blog</a>\n'
)
NESTED_BLOG = (
    '        <a class="site-nav__link" href="../blog.html"><img src="../image/blog.png" alt="" '
    'class="site-nav__link-icon" width="18" height="18" loading="lazy" /> Blog</a>\n'
)

updated = []
skipped = []

for path in ROOT.rglob("*.html"):
    if path.name.startswith("_"):
        continue
    text = path.read_text(encoding="utf-8")
    if "CLAT GK" not in text and "clatgk" not in text.lower():
        continue
    if "blog.png" in text and 'href="blog.html"' in text or (
        "blog.png" in text and 'href="../blog.html"' in text
    ):
        # already has blog (blog.html itself etc.)
        if "Blog</a>" in text and "blog.png" in text:
            skipped.append(str(path.relative_to(ROOT)))
            continue

    # Determine relative depth for image/href
    rel = path.relative_to(ROOT)
    in_html_files = "html_files" in rel.parts
    blog_line = NESTED_BLOG if in_html_files else ROOT_BLOG

    # Also handle root pages that link contact as html_files/contactus
    # Insert after any GK nav anchor line that precedes Contact
    lines = text.splitlines(keepends=True)
    out = []
    i = 0
    changed = False
    while i < len(lines):
        line = lines[i]
        out.append(line)
        # Detect GK nav link (single-line anchors)
        is_gk = (
            "clatgk" in line.lower()
            and "site-nav__link" in line
            and ("CLAT GK" in line or "clat gk" in line.lower() or "clat%20gk" in line.lower())
        )
        if is_gk and not changed:
            # peek next non-empty for contact; insert blog before contact if next is contact
            j = i + 1
            while j < len(lines) and lines[j].strip() == "":
                out.append(lines[j])
                j += 1
            next_line = lines[j] if j < len(lines) else ""
            if "blog.png" in next_line and "Blog" in next_line:
                i = j
                continue
            if "site-nav__link" in next_line and (
                "contactus" in next_line.lower() or "Contact us" in next_line
            ):
                out.append(blog_line)
                changed = True
                i = j
                continue
            # GK might be multi-line? unlikely; still insert blog after GK
            if "site-nav__link" in next_line:
                out.append(blog_line)
                changed = True
        i += 1

    if changed:
        path.write_text("".join(out), encoding="utf-8")
        updated.append(str(rel))
    else:
        skipped.append(str(rel) + " (no change)")

print("UPDATED:", len(updated))
for u in updated:
    print(" +", u)
print("SKIPPED:", len(skipped))
for s in skipped[:20]:
    print(" -", s)
