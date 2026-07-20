type StartScreenProps = {
  onStart: () => void;
  loading: boolean;
};

export default function StartScreen({ onStart, loading }: StartScreenProps) {
  return (
    <section className="screen card start-screen">
      <div>
        <p className="eyebrow">雨夜末班调度 · 你的高光时刻</p>
        <h1>末班信号站</h1>
        <p className="lede">
          晚上好，调度员！你是今晚最后一班的守护者。暴雨 24 秒后抵达这座城市，
          偏偏雨前的雷电把几段轨道劈得噼啪作响——信号系统也跟着闹脾气，自动调度全罢工了。
        </p>
        <p className="lede">
          所谓末班车，其实乘客早就散了：甲始、乙始、丙始开出的是空车，要把它们安全送回甲站、乙站、丙站——
          那里既是今夜的终点，也是明天早班发车的起点。好在还有你，亲手把这三列空车一辆辆送回家。冲吧！
        </p>
        <p className="rules-title">怎么玩</p>
        <ul className="rules-list">
          <li>🚆 列车会沿路线自动向前跑，你只需在地图上动动手，不用一直盯。</li>
          <li>🔀 列车临近分岔口时方向箭头会亮起，点一下就换方向变道；把鼠标悬在箭头上能先预览变道后的整条路线。</li>
          <li>⚡ 红色路段是被雷劈坏的，千万别开进去；两辆车同一秒挤上同一段路也会相撞。一旦出事故，全体列车停下检修 6 秒，损坏路段还会重新洗牌。</li>
          <li>⏸ 手忙脚乱时点「全体暂停」，让所有车停 3 秒错峰——但注意暴雨倒计时不会跟着停。</li>
          <li>🌧 目标：在 24 秒暴雨到达前，把尽量多的车安全送回各自终点站，事故和暂停越少越好。</li>
        </ul>
        <p className="rules-title">评级怎么算</p>
        <ul className="rules-list rating-rules">
          <li><strong>S</strong> — 3 车全部到站，0 事故、0 暂停（全靠变道零失误，最高荣誉）</li>
          <li><strong>A</strong> — 3 车全部到站，0 事故（用过暂停也算）</li>
          <li><strong>B</strong> — 3 车全部到站（路上出过事故 / 用过暂停）</li>
          <li><strong>C</strong> — 2 车安全到站</li>
          <li><strong>D</strong> — 到站不足 2 车</li>
        </ul>
      </div>
      <div className="start-actions">
        <button className="primary-button" onClick={onStart} disabled={loading}>
          {loading ? '正在建立调度台...' : '开始调度'}
        </button>
      </div>
    </section>
  );
}
