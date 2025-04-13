---
layout: page
title: Tags
---

{%- if site.tags.size > 0 -%}
  <ul>
    {%- for tag in site.tags -%}
        <li>
          <a href="{{ tag[0] | prepend: "/tag/" | relative_url }}">{{ tag[0] }}</a>
        </li>
    {%- endfor -%}
  </ul>
{%- endif -%}
