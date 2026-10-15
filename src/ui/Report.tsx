import { useState, type ReactNode } from 'react'
import type { AxisEvaluation } from '../calc/axisSelection'
import type { KitMatch } from '../calc/kitSelection'
import { accelTimeFor } from '../calc/motionProfile'
import type { DriveEvaluation } from '../calc/motorSelection'
import type { Requirements, Settings, Status } from '../calc/types'
import type { Kit } from '../data/types'
import { CheckTable, Ratio, StatusBadge } from './common'
import { driveLabel, fmt, mountingLabel, moveLabel } from './format'
import { SpeedRatio } from './MotorStep'
import { ProfilePlot } from './ProfileChart'

interface Props {
  req: Requirements
  settings: Settings
  axis: AxisEvaluation
  drive: DriveEvaluation | null
  /** Direct drive plus every compatible gearbox for the selected motor */
  gearboxOptions: DriveEvaluation[]
  kitMatch: KitMatch | null
  kit: Kit | null
}

type Row = [label: string, value: ReactNode]

/** Label/value pairs, two pairs per table row. */
function SpecTable({ rows }: { rows: Row[] }) {
  const pairs: Row[][] = []
  for (let i = 0; i < rows.length; i += 2) pairs.push(rows.slice(i, i + 2))
  return (
    <table className="report-spec">
      <tbody>
        {pairs.map((pair) => (
          <tr key={pair[0][0]}>
            {pair.map(([label, value]) => (
              <Cell key={label} label={label} value={value} />
            ))}
            {pair.length === 1 && <td colSpan={2} />}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Cell({ label, value }: { label: string; value: ReactNode }) {
  return (
    <>
      <th>{label}</th>
      <td>{value ?? '—'}</td>
    </>
  )
}

/** Number with unit, or a dash when missing. */
function q(value: number | null | undefined, unit: string, digits = 3): string {
  return value == null ? '—' : `${fmt(value, digits)} ${unit}`
}

function Chapter({ no, title, children }: { no: number; title: string; children: ReactNode }) {
  return (
    <section className="report-chapter">
      <h2>
        <span className="step-no">{no}</span> {title}
      </h2>
      {children}
    </section>
  )
}

export function Report({ req, settings, axis, drive, gearboxOptions, kitMatch, kit }: Props) {
  const a = axis.axis
  const g = drive?.gearbox ?? null
  const vertical = req.mounting === 'vertical'
  const p = axis.profile
  const [today] = useState(() => new Date().toLocaleDateString('ko-KR'))
  const selection: [string, string, string, string | null, Status | null][] = [
    ['직교 축', 'Festo', a.model, null, axis.status],
    ['모터', drive?.motor.maker ?? '—', drive?.motor.model ?? '선택 안 됨', null, drive?.status ?? null],
    ['감속기', g?.maker ?? '—', drive ? (g ? `${g.model} (${g.ratio}:1)` : '직결 (감속기 없음)') : '—', g?.partNumber ?? null, null],
    ['연결키트', kit ? 'Festo' : '—', kit?.product ?? (drive ? '해당 키트 없음' : '—'), kit?.partNumber ?? null, null],
  ]

  return (
    <div className="report">
      <Chapter no={1} title="입력 데이터 · 선정 모델">
        <p className="report-meta">
          직교 축 선정 계산서 · {today}
        </p>

        <h3>사용 조건</h3>
        <SpecTable
          rows={[
            ['축 설치 방향', mountingLabel[req.mounting]],
            ['스트로크', q(req.stroke, 'mm')],
            ['소재 무게', q(req.payload, 'kg')],
            ['속도', q(req.velocity, 'm/s')],
            ['가속도', q(req.acceleration, 'm/s²')],
            ['가속 시간', q(accelTimeFor(req.velocity, req.acceleration, req.jerk), 's')],
            ['저크', req.jerk > 0 ? q(req.jerk, 'm/s³') : '제한 없음 (사다리꼴)'],
            ['휴지 시간', q(settings.dwellTime, 's')],
            ['무게 중심 X / Y / Z', `${fmt(req.cog.x)} / ${fmt(req.cog.y)} / ${fmt(req.cog.z)} mm`],
          ]}
        />

        <h3>상세 설정</h3>
        <SpecTable
          rows={[
            ['구동 효율 (스핀들 / 벨트)', `${fmt(settings.efficiency.spindle)} / ${fmt(settings.efficiency.belt)}`],
            ['마찰 계수 (스핀들 / 벨트)', `${fmt(settings.friction.spindle)} / ${fmt(settings.friction.belt)}`],
            ['외부 반력 Fc', q(settings.externalForce, 'N')],
            ['가이드 저항 FG', q(settings.guideResistance, 'N')],
            ['커플링 관성', q(settings.couplingInertia, 'kg·cm²', 4)],
            ['기본 허용 관성비', q(settings.defaultInertiaRatio, '배')],
            ['지지 간격', settings.supportSpan > 0 ? q(settings.supportSpan, 'mm') : '양 끝만 지지'],
            ['일 가동 시간', q(settings.hoursPerDay, 'h')],
            ['브레이크', settings.requireBrake ? '필요' : '선택'],
            ['보수적 판정', settings.conservative ? '켜짐 (등속 구간 정격 토크 초과 시 부적합)' : '꺼짐'],
          ]}
        />

        <h3>선정 모델</h3>
        <table className="report-table">
          <thead>
            <tr>
              <th>구분</th>
              <th>메이커</th>
              <th>모델명</th>
              <th>주문번호</th>
              <th>판정</th>
            </tr>
          </thead>
          <tbody>
            {selection.map(([part, maker, model, partNumber, status]) => (
              <tr key={part}>
                <td>{part}</td>
                <td>{maker}</td>
                <td className="model">{model}</td>
                <td>{partNumber ?? '—'}</td>
                <td>{status ? <StatusBadge status={status} /> : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>

      </Chapter>

      <Chapter no={2} title="모션 프로파일">
        <dl className="profile">
          <div>
            <dt>최고 속도</dt>
            <dd>
              {fmt(p.peakVelocity, 3)} m/s{!p.reachedVelocity && <span className="warn-text"> (설정 속도 미도달)</span>}
            </dd>
          </div>
          <div>
            <dt>최대 가속도</dt>
            <dd>{fmt(p.peakAcceleration, 2)} m/s²</dd>
          </div>
          <div>
            <dt>가속 시간</dt>
            <dd>{fmt(p.accelTime, 3)} s</dd>
          </div>
          <div>
            <dt>등속 시간</dt>
            <dd>{fmt(p.constantTime, 3)} s</dd>
          </div>
          <div>
            <dt>이동 시간 (편도)</dt>
            <dd>{fmt(p.moveTime, 3)} s</dd>
          </div>
          <div>
            <dt>사이클 (왕복)</dt>
            <dd>{fmt(axis.cycleTime, 3)} s</dd>
          </div>
        </dl>
        {[false, true].map((back) => (
          <figure key={String(back)} className="profile-chart report-chart">
            <figcaption>
              {moveLabel(back, vertical)}
              {settings.dwellTime > 0 ? ' + 휴지' : ''} (편도, 가로축 시간 s)
            </figcaption>
            <ProfilePlot axis={axis} drive={drive} settings={settings} view={back ? 'back' : 'forward'} />
          </figure>
        ))}
      </Chapter>

      <Chapter no={3} title="축 선정 세부사항">
        <h3>{a.model}</h3>
        <SpecTable
          rows={[
            ['제품군', [a.family, a.variant].filter(Boolean).join('-')],
            ['구동 방식', driveLabel[a.drive]],
            ['최대 스트로크', q(a.maxStroke, 'mm')],
            ['최대 속도', q(a.maxSpeed, 'm/s')],
            ['최대 가속도', q(a.maxAcceleration, 'm/s²')],
            ['최대 이송력', q(a.maxFeedForce, 'N')],
            ['무부하 구동 토크', q(a.noLoadTorque, 'Nm')],
            ['최대 구동 토크', q(a.maxDrivingTorque, 'Nm')],
            ['회전당 이송량', q(axis.feed, 'mm/rev')],
            ['반복 정밀도', a.repeatability == null ? '—' : `±${fmt(a.repeatability, 3)} mm`],
            ['이동 질량 (소재 + 슬라이드)', q(axis.movingMass, 'kg')],
            ['축 질량', q(axis.axisMass, 'kg')],
            ['구동축 환산 관성', q(axis.inertia, 'kg·cm²', 4)],
            ['구동 효율', fmt(axis.efficiency)],
            ['인터페이스 코드', a.interfaceCode ?? '—'],
          ]}
        />
        <h3>검토 항목</h3>
        <CheckTable checks={axis.checks} />
        {axis.info.length > 0 && (
          <>
            <h3>참고값</h3>
            <SpecTable rows={axis.info.map((i): Row => [i.label, `${q(i.value, i.unit)}${i.note ? ` (${i.note})` : ''}`])} />
          </>
        )}
      </Chapter>

      <Chapter no={4} title="모터 선정 세부사항">
        {!drive ? (
          <p className="empty">모터를 선택하지 않았습니다.</p>
        ) : (
          <>
            <h3>
              {drive.motor.maker} {drive.motor.model}
            </h3>
            <SpecTable
              rows={[
                ['시리즈', [drive.motor.series, drive.motor.description].filter(Boolean).join(' · ') || '—'],
                ['브레이크', drive.motor.brake ? '있음' : '없음'],
                ['정격 출력', q(drive.motor.ratedPower, 'W', 0)],
                ['정격 / 최대 토크', `${fmt(drive.motor.ratedTorque, 3)} / ${fmt(drive.motor.peakTorque, 3)} Nm`],
                ['정격 / 최대 회전수', `${fmt(drive.motor.ratedSpeed, 0)} / ${fmt(drive.motor.maxSpeed, 0)} rpm`],
                ['로터 관성', q(drive.motor.inertia, 'kg·cm²', 4)],
                ['허용 관성비', q(drive.motor.allowableInertiaRatio, '배')],
                ['허용 회생 전력', q(drive.motor.regenPower, 'W')],
                ['앰프', drive.motor.amplifier ?? '—'],
                ['인터페이스 코드', drive.motor.interfaceCode ?? '—'],
              ]}
            />
            <h3>운전 결과 {g ? `(감속기 ${g.model} ${g.ratio}:1 포함)` : '(직결)'}</h3>
            <SpecTable
              rows={[
                ['최대 토크', q(drive.peakTorque, 'Nm')],
                ['실효 토크', q(drive.rmsTorque, 'Nm')],
                ['최대 회전수', q(drive.maxMotorSpeed, 'rpm', 0)],
                ['관성비', q(drive.inertiaRatio, '배')],
                ['회생 전력 (사이클 평균)', q(drive.regenPower, 'W')],
              ]}
            />
            <h3>검토 항목</h3>
            <CheckTable checks={drive.checks} />
          </>
        )}
      </Chapter>

      <Chapter no={5} title="감속기 세부사항">
        {!drive ? (
          <p className="empty">모터를 선택하지 않았습니다.</p>
        ) : (
          <>
            {g ? (
              <>
                <h3>
                  {g.maker} {g.model}
                </h3>
                <SpecTable
                  rows={[
                    ['감속비', `${g.ratio}:1`],
                    ['주문번호', g.partNumber ?? '—'],
                    ['단수', g.stage == null ? '—' : `${g.stage}단`],
                    ['플랜지 크기', q(g.flangeSize, 'mm', 0)],
                    ['정격 출력 토크', q(g.continuousTorque, 'Nm')],
                    ['최대 출력 토크', q(g.maxTorque, 'Nm')],
                    ['최대 입력 회전수', q(g.maxInputSpeed, 'rpm', 0)],
                    ['관성 (입력측)', q(g.inertia, 'kg·cm²', 4)],
                    ['효율', q(g.efficiency, '%', 1)],
                    ['인터페이스 코드 (출력측)', g.interfaceCode ?? '—'],
                  ]}
                />
                <p className="muted small-print">감속기 관련 검토(최대 출력 토크, 최대 입력 회전수)는 4장 모터 검토 항목에 포함됩니다.</p>
              </>
            ) : (
              <p className="report-note">감속기를 사용하지 않습니다 (직결: 축 - 연결키트 - 모터).</p>
            )}
            {gearboxOptions.length > 1 && (
              <>
                <h3>{drive.motor.model} 호환 감속기 비교</h3>
                <table className="report-table">
                  <thead>
                    <tr>
                      <th>판정</th>
                      <th>메이커</th>
                      <th>모델명</th>
                      <th className="num">감속비</th>
                      <th>최대 토크</th>
                      <th>실효 토크</th>
                      <th>회전수</th>
                      <th>관성비</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gearboxOptions.map((d) => {
                      const inertia = d.checks.find((c) => c.label === '관성비')
                      const picked = (d.gearbox?.id ?? null) === (g?.id ?? null)
                      return (
                        <tr key={d.gearbox?.id ?? 'direct'} className={picked ? 'report-picked' : undefined}>
                          <td>
                            <StatusBadge status={d.status} />
                          </td>
                          <td>{d.gearbox?.maker ?? '—'}</td>
                          <td className="model">
                            {d.gearbox ? d.gearbox.model : '직결'}
                            {picked && ' (선정)'}
                          </td>
                          <td className="num">{d.gearbox ? `${d.gearbox.ratio}:1` : '—'}</td>
                          <td>
                            <Ratio ratio={d.peakTorque / d.motor.peakTorque} />
                          </td>
                          <td>
                            <Ratio ratio={d.rmsTorque / d.motor.ratedTorque} />
                          </td>
                          <td>
                            <SpeedRatio drive={d} />
                          </td>
                          <td>
                            <Ratio ratio={inertia?.ratio ?? null} />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </>
            )}
          </>
        )}
      </Chapter>

      <Chapter no={6} title="연결키트 세부사항">
        {!kitMatch ? (
          <p className="empty">모터를 선택하지 않았습니다.</p>
        ) : (
          <>
            <SpecTable
              rows={[
                ['축 인터페이스 코드', kitMatch.axisCode ?? '—'],
                [`${kitMatch.motorSide === 'gearbox' ? '감속기 (출력측)' : '모터'} 인터페이스 코드`, kitMatch.motorCode ?? '—'],
              ]}
            />
            {kit ? (
              <>
                <h3>{kit.product}</h3>
                <SpecTable
                  rows={[
                    ['주문번호', kit.partNumber ?? '—'],
                    ['종류', kit.type === 'axial' ? '직렬 키트' : '병렬 키트'],
                    ['견시창', kit.window ? '있음' : '없음'],
                    kit.type === 'axial' ? ['커플링', kit.coupling ?? '—'] : ['풀리 품번', kit.pulley ?? '—'],
                  ]}
                />
                <p className="muted small-print">연결키트의 관성, 전달 토크 등은 데이터에 아직 없어 계산에 포함되지 않았습니다.</p>
              </>
            ) : (
              <p className="report-note">조건에 맞는 연결키트가 없습니다.</p>
            )}
          </>
        )}
      </Chapter>
    </div>
  )
}
