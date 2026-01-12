---
title: 澳洲拖挂式房车购买决策流程图
layout: post
tags:
  - caravan
---

<div class="mermaid">
flowchart TD
    A[开始: 已知前车参数] --> B{最大拖拽能力?}

    B -->|小于1500kg| B1[轻量拖车/小型房车]
    B -->|1500-2500kg| B2[中小型单轴房车]
    B -->|2500-3500kg| B3[双轴/中大型房车]
    B -->|大于3500kg| B4[重型越野房车]

    B1 --> C
    B2 --> C
    B3 --> C
    B4 --> C

    C{车辆GCM或GVM允许?}
    C -->|否| C1[超重,需减重或换车]
    C -->|是| D

    D{房车ATM ≤ 拖拽能力?}
    D -->|否| D1[房车过重]
    D -->|是| E

    E{Tow Ball Mass ≤ Tow Ball Load?}
    E -->|否| E1[尾部承重超标]
    E -->|是| F

    F{拖车插头类型?}
    F -->|7-pin| F1[基础灯光, 无电]
    F -->|12-pin| F2[支持冰箱/电池]
    F -->|Anderson| F3[高功率供电]

    F1 --> G
    F2 --> G
    F3 --> G

    G{车辆有电刹控制器?}
    G -->|否| G1[需加装电刹控制器]
    G -->|是| H

    H{拖钩类型?}
    H -->|50mm球头| H1[标准公路拖挂]
    H -->|DO35/Treg/McHitch| H2[越野房车适合]
    H -->|不匹配| H3[需更换拖挂]

    H1 --> I[可购买房车]
    H2 --> I
    H3 --> J[需改装后再购买]

    G1 --> J
    C1 --> J
    D1 --> J
    E1 --> J

    J[不建议直接购买]
</div>

<script type="module">
    import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs';
    mermaid.initialize({ startOnLoad: true });
</script>

