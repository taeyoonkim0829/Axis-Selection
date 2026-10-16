import { useState, type ReactNode } from 'react'
import type { AxisEvaluation } from '../calc/axisSelection'
import type { KitMatch } from '../calc/kitSelection'
import { accelTimeFor } from '../calc/motionProfile'
import type { DriveEvaluation } from '../calc/motorSelection'
import { verticalForward, type Requirements, type Settings, type Status } from '../calc/types'
import type { KitEvaluation } from '../calc/kitSelection'
import { translateData, useLang, useT } from '../i18n'
import { CheckTable, Ratio, StatusBadge } from './common'
import { DrivePackage } from './DrivePackage'
import { KitNotes } from './KitStep'
import { axisDetailChecks, driveLabel, fmt, kgf, mountingLabel, moveLabel, pressDirectionLabel } from './format'
import { ProfileNumbers } from './MotionProfile'
import { SpeedRatio } from './MotorStep'
import { ProfilePlot, type ProfileView } from './ProfileChart'

interface Props {
  req: Requirements
  settings: Settings
  axis: AxisEvaluation
  drive: DriveEvaluation | null
  /** Direct drive plus every compatible gearbox for the selected motor */
  gearboxOptions: DriveEvaluation[]
  kitMatch: KitMatch | null
  kit: KitEvaluation | null
  /** Motion profile view selected on screen */
  profileView: ProfileView
}

type Row = [label: string, value: ReactNode]

/** Label/value pairs, two pairs per table row. Labels are Korean source text, translated here. */
function SpecTable({ rows }: { rows: Row[] }) {
  const t = useT()
  const pairs: Row[][] = []
  for (let i = 0; i < rows.length; i += 2) pairs.push(rows.slice(i, i + 2))
  return (
    <table className="report-spec">
      <tbody>
        {pairs.map((pair) => (
          <tr key={pair[0][0]}>
            {pair.map(([label, value]) => (
              <Cell key={label} label={t(label)} value={value} />
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

export function Report({ req, settings, axis, drive, gearboxOptions, kitMatch, kit: kitEval, profileView }: Props) {
  const kit = kitEval?.kit ?? null
  const t = useT()
  const lang = useLang()
  const a = axis.axis
  const g = drive?.gearbox ?? null
  const vertical = verticalForward(req)
  const times = t('배')
  const [today] = useState(() => new Date().toLocaleDateString(lang === 'ko' ? 'ko-KR' : 'en-US'))
  const selection: [string, string, string, string | null, Status | null][] = [
    [t('직교 축'), 'Festo', axis.order.model, axis.order.partNumber, axis.status],
    [t('모터'), drive?.motor.maker ?? '—', drive?.motor.model ?? t('선택 안 됨'), null, drive?.status ?? null],
    [
      t('감속기'),
      g?.maker ?? '—',
      drive ? (g ? `${g.model} (${g.ratio}:1)` : t('감속기 미사용')) : '—',
      g?.partNumber ?? null,
      null,
    ],
    [t('연결키트'), kit ? 'Festo' : '—', kit?.product ?? (drive ? t('해당 키트 없음') : '—'), kit?.partNumber ?? null, kitEval?.status ?? null],
  ]
  const noMotor = <p className="empty">{t('모터를 선택하지 않았습니다.')}</p>

  return (
    <div className="report">
      <Chapter no={1} title={t('입력 데이터 · 선정 모델')}>
        <p className="report-meta">{t('직교 축 선정 계산서 · {date}', { date: today })}</p>

        <h3>{t('사용 조건')}</h3>
        <SpecTable
          rows={[
            ['축 설치 방향', t(mountingLabel[req.mounting])],
            ['스트로크', q(req.stroke, 'mm')],
            ['소재 무게', q(req.payload, 'kg')],
            ['속도', q(req.velocity, 'm/s')],
            ['가속도', q(req.acceleration, 'm/s²')],
            ['가속 시간', q(accelTimeFor(req.velocity, req.acceleration, req.jerk), 's')],
            ['저크', req.jerk > 0 ? q(req.jerk, 'm/s³') : t('제한 없음 (사다리꼴)')],
            ['휴지 시간', q(settings.dwellTime, 's')],
            ['어플리케이션', t(axis.press ? '프레싱' : '일반')],
            ...(axis.press
              ? ([
                  ...(vertical ? [['압착 방향', t(pressDirectionLabel[req.press!.direction])] as Row] : []),
                  ['압착력', `${q(axis.press.force, 'N')} (${kgf(axis.press.force)})`],
                  ['압착 구간', q(axis.press.distance, 'mm')],
                  ['압착 속도', q(req.press!.speed, 'm/s')],
                  ['가압 유지 시간', q(axis.press.holdTime, 's')],
                ] as Row[])
              : []),
            ['무게 중심 X / Y / Z', `${fmt(req.cog.x)} / ${fmt(req.cog.y)} / ${fmt(req.cog.z)} mm`],
          ]}
        />

        <h3>{t('상세 설정')}</h3>
        <SpecTable
          rows={[
            ['구동 효율 (볼스크류 / 벨트)', `${fmt(settings.efficiency.spindle)} / ${fmt(settings.efficiency.belt)}`],
            ['마찰 계수 (볼스크류 / 벨트)', `${fmt(settings.friction.spindle)} / ${fmt(settings.friction.belt)}`],
            ['외부 반력 Fc', q(settings.externalForce, 'N')],
            ['가이드 저항 FG', q(settings.guideResistance, 'N')],
            ['커플링 관성', q(settings.couplingInertia, 'kg·cm²', 4)],
            ['기본 허용 관성비', q(settings.defaultInertiaRatio, times)],
            ['지지 간격', settings.supportSpan > 0 ? q(settings.supportSpan, 'mm') : t('양 끝만 지지')],
            ['일 가동 시간', q(settings.hoursPerDay, 'h')],
            ['브레이크', settings.requireBrake ? t('필요') : t('선택')],
            ['감속기', settings.useGearbox ? t('감속기 사용') : t('감속기 미사용')],
            ['ESBF 외부 가이드', settings.externalGuide ? t('사용 (로드 횡하중 검토 생략)') : t('미사용')],
            ['보수적 판정', settings.conservative ? t('켜짐 (등속 구간 정격 토크 초과 시 부적합)') : t('꺼짐')],
          ]}
        />

        <h3>{t('선정 모델')}</h3>
        <table className="report-table">
          <thead>
            <tr>
              <th>{t('구분')}</th>
              <th>{t('메이커')}</th>
              <th>{t('모델명')}</th>
              <th>{t('주문번호')}</th>
              <th>{t('판정')}</th>
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

      <Chapter no={2} title={t('모션 프로파일')}>
        <ProfileNumbers axis={axis} />
        <figure className="profile-chart report-chart">
          <figcaption>
            {t(profileView === 'cycle' ? '왕복' : moveLabel(profileView === 'back', vertical))}
            {profileView !== 'back' && axis.press ? ` + ${t('압착')}` : ''}
            {settings.dwellTime > 0 ? ` + ${t('휴지')}` : ''} ({t('가로축 시간 s')})
          </figcaption>
          <ProfilePlot axis={axis} drive={drive} settings={settings} view={profileView} />
        </figure>
      </Chapter>

      <Chapter no={3} title={t('축 선정 세부사항')}>
        <h3>{axis.order.model}</h3>
        <SpecTable
          rows={[
            ...(axis.order.stroke != null
              ? ([
                  ['주문번호', axis.order.partNumber ?? '—'],
                  [
                    '주문 스트로크',
                    `${q(axis.order.stroke, 'mm')}${axis.order.modular ? ` (${t('모듈러 제품, 모듈 번호로 주문')})` : ''}`,
                  ],
                ] as Row[])
              : []),
            ['제품군', [a.family, a.variant].filter(Boolean).join('-')],
            ['구동 방식', t(driveLabel[a.drive])],
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
        <h3>{t('검토 항목')}</h3>
        <CheckTable checks={axisDetailChecks(axis)} />
        {axis.info.length > 0 && (
          <>
            <h3>{t('참고값')}</h3>
            <SpecTable
              rows={axis.info.map((i): Row => {
                const text = `${q(i.value, i.unit)}${i.note ? ` (${t(i.note, i.noteArgs)})` : ''}`
                return [i.label, i.alert ? <span key={i.label} className="fail-text">{text}</span> : text]
              })}
            />
          </>
        )}
      </Chapter>

      <Chapter no={4} title={t('모터 선정 세부사항')}>
        {!drive ? (
          noMotor
        ) : (
          <>
            <h3>
              {drive.motor.maker} {drive.motor.model}
            </h3>
            <SpecTable
              rows={[
                [
                  '시리즈',
                  translateData(lang, [drive.motor.series, drive.motor.description].filter(Boolean).join(' · ')) || '—',
                ],
                ['브레이크', drive.motor.brake ? t('있음') : t('없음')],
                ['정격 출력', q(drive.motor.ratedPower, 'W', 0)],
                ['정격 / 최대 토크', `${fmt(drive.motor.ratedTorque, 3)} / ${fmt(drive.motor.peakTorque, 3)} Nm`],
                ['정격 / 최대 회전수', `${fmt(drive.motor.ratedSpeed, 0)} / ${fmt(drive.motor.maxSpeed, 0)} rpm`],
                ['로터 관성', q(drive.motor.inertia, 'kg·cm²', 4)],
                ['허용 관성비', q(drive.motor.allowableInertiaRatio, times)],
                ['허용 회생 전력', q(drive.motor.regenPower, 'W')],
                ['앰프', drive.motor.amplifier ?? '—'],
                ['인터페이스 코드', drive.motor.interfaceCode ?? '—'],
              ]}
            />
            <h3>
              {g
                ? t('운전 결과 (감속기 {model} {ratio}:1 포함)', { model: g.model, ratio: g.ratio })
                : t('운전 결과 (감속기 미사용)')}
            </h3>
            <SpecTable
              rows={[
                ['최대 토크', q(drive.peakTorque, 'Nm')],
                ['실효 토크', q(drive.rmsTorque, 'Nm')],
                ['최대 회전수', q(drive.maxMotorSpeed, 'rpm', 0)],
                ['관성비', q(drive.inertiaRatio, times)],
                ['회생 전력 (사이클 평균)', q(drive.regenPower, 'W')],
              ]}
            />
            <h3>{t('검토 항목')}</h3>
            <CheckTable checks={drive.checks} />
            {drive.controller && <DrivePackage selection={drive.controller} cableLength={settings.cableLength} />}
          </>
        )}
      </Chapter>

      <Chapter no={5} title={t('감속기 세부사항')}>
        {!drive ? (
          noMotor
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
                    ['단수', g.stage == null ? '—' : t('{n}단', { n: g.stage })],
                    ['플랜지 크기', q(g.flangeSize, 'mm', 0)],
                    ['정격 출력 토크', q(g.continuousTorque, 'Nm')],
                    ['최대 출력 토크', q(g.maxTorque, 'Nm')],
                    ['최대 입력 회전수', q(g.maxInputSpeed, 'rpm', 0)],
                    ['관성 (입력측)', q(g.inertia, 'kg·cm²', 4)],
                    ['효율', q(g.efficiency, '%', 1)],
                    ['인터페이스 코드 (출력측)', g.interfaceCode ?? '—'],
                  ]}
                />
                <p className="muted small-print">
                  {t('감속기 관련 검토(최대 출력 토크, 최대 입력 회전수)는 4장 모터 검토 항목에 포함됩니다.')}
                </p>
              </>
            ) : (
              <p className="report-note">{t('감속기를 사용하지 않습니다 (축 - 연결키트 - 모터).')}</p>
            )}
            {gearboxOptions.length > 1 && (
              <>
                <h3>{t('{model} 호환 감속기 비교', { model: drive.motor.model })}</h3>
                <table className="report-table">
                  <thead>
                    <tr>
                      <th>{t('판정')}</th>
                      <th>{t('메이커')}</th>
                      <th>{t('모델명')}</th>
                      <th className="num">{t('감속비')}</th>
                      <th>{t('최대 토크')}</th>
                      <th>{t('실효 토크')}</th>
                      <th>{t('회전수')}</th>
                      <th>{t('관성비')}</th>
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
                            {d.gearbox ? d.gearbox.model : t('감속기 미사용')}
                            {picked && ` (${t('선정')})`}
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

      <Chapter no={6} title={t('연결키트 세부사항')}>
        {!kitMatch ? (
          noMotor
        ) : (
          <>
            <SpecTable
              rows={[
                ['축 인터페이스 코드', kitMatch.axisCode ?? '—'],
                [
                  kitMatch.motorSide === 'gearbox' ? '감속기 (출력측) 인터페이스 코드' : '모터 인터페이스 코드',
                  kitMatch.motorCode ?? '—',
                ],
              ]}
            />
            {kit ? (
              <>
                <h3>{kit.product}</h3>
                <SpecTable
                  rows={[
                    ['주문번호', kit.partNumber ?? '—'],
                    ['종류', t(kit.type === 'axial' ? '직렬 키트' : '병렬 키트')],
                    ['견시창', kit.window ? t('있음') : t('없음')],
                    kit.type === 'axial' ? ['커플링', kit.coupling ?? '—'] : ['풀리 품번', kit.pulley ?? '—'],
                    ['전달 토크', kit.transmissibleTorque != null ? q(kit.transmissibleTorque, 'Nm') : '—'],
                    ['관성 모멘트', kit.inertia != null ? q(kit.inertia, 'kg·cm²') : '—'],
                    ['최대 회전수', kit.maxSpeed != null ? q(kit.maxSpeed, 'rpm') : '—'],
                    ...(kit.noLoadTorque != null ? ([['무부하 토크', q(kit.noLoadTorque, 'Nm')]] as Row[]) : []),
                  ]}
                />
                {kitEval && <CheckTable checks={kitEval.checks} />}
                {kitEval && kitEval.notes.length > 0 && <KitNotes notes={kitEval.notes} />}
              </>
            ) : (
              <p className="report-note">{t('조건에 맞는 연결키트가 없습니다.')}</p>
            )}
          </>
        )}
      </Chapter>
    </div>
  )
}
