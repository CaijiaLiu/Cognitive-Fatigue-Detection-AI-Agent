# NeuroLens — Cognitive & Behavioral Analysis Platform

**领域：** Computational Neuroscience · Biomedical Science · Computer Vision · Machine Learning

## 1. Project Goal

利用普通电脑摄像头，实时追踪人的**眼球运动、注视行为、眨眼、面部肌肉变化及头部动作**，结合认知实验与机器学习，研究这些生理与行为特征与注意力、走神、认知疲劳之间的关系。

> **Research Question:** How do ocular and facial behavioral patterns reflect changes in human cognitive states?

项目定位为非侵入式数字生物标志物（Digital Biomarker）**探索性研究平台**，不是疾病诊断工具。

## 2. System Architecture

```text
Data Acquisition
  Webcam · Cognitive Tasks · Self-reports
                 │
       ┌─────────┴─────────┐
       │                   │
  Eye Tracking        Face Tracking
  Gaze · Blinks       Facial Actions
  Eye Movements       Head Pose
       │                   │
       └─────────┬─────────┘
                 │
Feature Extraction & Data Processing
  MediaPipe · OpenCV · Time-Series Processing
                 │
Research & Machine Learning Engine
  Statistical Analysis · Logistic Regression
  Random Forest · Bagging
                 │
Cognitive & Behavioral Analysis
  Fatigue · Mind Wandering · Visual Attention
  Behavioral Patterns
                 │
Interactive Research Dashboard
  Heatmaps · Timelines · Trends · Reports
```

**设计原则：** 将数据采集、特征提取、实验任务、统计分析、机器学习和应用模块解耦，以便复用同一套追踪与分析引擎。

## 3. Biological & Behavioral Features

| Category | 具体分析指标 | 研究目的 |
|---|---|---|
| **Eye Movement** | 视线方向、移动幅度、速度、变化频率 | 研究视觉探索与注意力转移 |
| **Gaze Behavior** | 注视持续时间、视线稳定性、离屏频率 | 研究视觉注意力分配 |
| **Blink Dynamics** | 眨眼频率、间隔、闭眼持续时间 | 研究疲劳、警觉性与走神 |
| **Facial Muscles** | 眉毛、眼周、嘴角、下颌动作变化 | 研究面部动作与任务负担的关联 |
| **Head Movement** | 头部转动、倾斜、姿态变化 | 研究行为稳定性及注意力转移 |
| **Cognitive Performance** | 反应时间、错误率、反应波动 | 测量认知任务表现 |

### 测量边界

- **Focused vs. Unstable Gaze** 可以作为研究特征，但不能直接把“眼神涣散”判定为走神。
- 普通摄像头适合粗粒度视线、眨眼、面部动作和头部姿态追踪；精确眼跳、注视次数及瞳孔直径测量通常需要校准、更高帧率或专用眼动仪。
- MediaPipe Face Landmarker 的面部 Blendshapes 可作为面部动作的代理特征，但不能直接推断心理状态或情绪。
- 所有指标都可能受到光照、摄像头角度、眼镜、睡眠、任务内容和个体差异的影响。

## 4. Research Modules

### A. Cognitive Fatigue Analysis

研究认知任务持续过程中，眼部行为、面部动作与反应速度是否出现系统性变化；结合个体 Baseline、疲劳自评和任务表现评估相关性。

### B. Mind Wandering Detection

研究眼神移动、眨眼、注视稳定性等特征与**自报告走神状态**之间的关联。通过随机 Thought Probes（询问用户刚才是否在关注任务）收集参考标签，训练并评估识别潜在走神时间段的模型。

### C. Facial & Ocular Behavioral Patterns

研究面部肌肉动作、眼部运动与头部姿态之间的关联，比较不同认知任务下的行为模式、变化趋势及个体差异。

## 5. Application Extensions

| Extension | 功能 |
|---|---|
| **Mock Interview Analysis** | 分析看向摄像头的比例、视线移动、头部动作及面部行为变化 |
| **Video Attention Tracking** | 用户上传视频，追踪观看过程中的视线方向、离屏行为、注意力时间线及粗粒度热图 |
| **ADHD-related Research** | 结合持续注意力任务，探索反应时间波动、视觉行为与注意力调节的关系；**不用于诊断 ADHD** |

## 6. Research Methodology

```text
Experimental Design
       ↓
Data Collection
       ↓
Feature Extraction
       ↓
Statistical Analysis
       ↓
Machine Learning Modeling
       ↓
Validation & Interpretation
```

- **实验与参考标签：** 设计持续注意力任务、反应时间任务、随机 Thought Probes 和自评量表，而不是直接以眨眼次数定义走神。
- **数据分析：** 比较个体 Baseline、时间趋势、指标间相关性、效应量和不确定性。
- **模型：** 使用 Logistic Regression 作为可解释基线，并比较 Random Forest、Bagging 等模型。
- **验证：** 尽量按参与者划分训练与测试集，避免相邻时间窗口造成数据泄漏；报告 Precision、Recall、F1 等适用指标。
- **混杂因素：** 记录任务类型、光照、睡眠、咖啡因、眼镜及摄像头质量等。
- **研究伦理：** 取得知情同意，优先本地处理，默认只保存必要的特征数据；涉及正式人体研究时确认伦理审批要求。
- **科学边界：** 关联不代表因果；不能把单一眼部或面部动作解释为确定的认知状态，不能在未经临床验证时给出诊断结论。

## 7. Technology Stack

| Component | Technology |
|---|---|
| Frontend | React + TypeScript |
| Face & Eye Tracking | MediaPipe Face Landmarker |
| Computer Vision | OpenCV |
| Backend | Python + FastAPI |
| Data Storage | SQLite + CSV / Parquet |
| Statistical Research | Pandas + SciPy + Statsmodels |
| Machine Learning | Scikit-learn |
| Visualization | Plotly |

## 8. Long-term Vision

构建一个可扩展的 **Non-invasive Digital Biomarker Research Platform**，通过多模态眼部与面部行为分析，探索认知状态变化，并将同一套技术应用于 Cognitive Fatigue、Mind Wandering、Video Attention 和 ADHD-related Attention Research。

**核心科研价值：** 不预设某个面部动作代表某种心理状态，而是通过实验数据检验哪些行为特征与认知状态存在稳定、可重复的关联。