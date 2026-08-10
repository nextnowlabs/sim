import {
  Button,
  ChipInput,
  ChipModal,
  ChipModalBody,
  ChipModalError,
  ChipModalField,
  ChipModalFooter,
  ChipModalHeader,
  Label,
} from '@sim/emcn'
import { useSettingsNavigation } from '@/hooks/use-settings-navigation'

interface NoOrganizationViewProps {
  hasTeamPlan: boolean
  hasEnterprisePlan: boolean
  isSelfHostedOrgEnabled: boolean
  orgName: string
  orgSlug: string
  setOrgSlug: (slug: string) => void
  onOrgNameChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onCreateOrganization: () => Promise<void>
  isCreatingOrg: boolean
  error: string | null
  createOrgDialogOpen: boolean
  setCreateOrgDialogOpen: (open: boolean) => void
}

export function NoOrganizationView({
  hasTeamPlan,
  hasEnterprisePlan,
  isSelfHostedOrgEnabled,
  orgName,
  orgSlug,
  setOrgSlug,
  onOrgNameChange,
  onCreateOrganization,
  isCreatingOrg,
  error,
  createOrgDialogOpen,
  setCreateOrgDialogOpen,
}: NoOrganizationViewProps) {
  const { navigateToSettings } = useSettingsNavigation()

  if (hasTeamPlan || hasEnterprisePlan) {
    return (
      <div>
        <div className='flex flex-col gap-5'>
          {/* Header - matching settings page style */}
          <div>
            <h4 className='font-medium text-[var(--text-primary)] text-base'>创建你的团队工作区</h4>
            <p className='mt-1 text-[var(--text-muted)] text-small'>
              {isSelfHostedOrgEnabled
                ? '组织功能已启用。创建组织以管理成员并使用企业版功能。'
                : `你已订阅 ${hasEnterprisePlan ? 'Enterprise' : 'Team'} 套餐。创建工作区,开始与你的团队成员协作。`}
            </p>
          </div>

          {/* Form fields - clean layout without card */}
          <div className='flex flex-col gap-4.5'>
            {/* Hidden decoy field to prevent browser autofill */}
            <input
              type='text'
              name='fakeusernameremembered'
              autoComplete='username'
              style={{ position: 'absolute', left: '-9999px', opacity: 0, pointerEvents: 'none' }}
              tabIndex={-1}
              readOnly
              aria-hidden='true'
              aria-label='请忽略此字段'
            />
            <div>
              <Label htmlFor='team-name-field' className='font-medium text-small'>
                团队名称
              </Label>
              <ChipInput
                id='team-name-field'
                value={orgName}
                onChange={onOrgNameChange}
                placeholder='我的团队'
                className='mt-1'
                name='team_name_field'
                autoComplete='off'
                autoCorrect='off'
                autoCapitalize='off'
                data-lpignore='true'
                data-form-type='other'
              />
            </div>

            <div>
              <Label htmlFor='orgSlug' className='font-medium text-small'>
                团队 URL
              </Label>
              <div className='mt-1 flex items-center'>
                <div className='rounded-l-[6px] border border-[var(--border-1)] border-r-0 bg-[var(--surface-4)] px-3 py-1.5 text-[var(--text-muted)] text-small'>
                  sim.ai/team/
                </div>
                <ChipInput
                  id='orgSlug'
                  value={orgSlug}
                  onChange={(e) => setOrgSlug(e.target.value)}
                  placeholder='my-team'
                  className='rounded-l-none'
                />
              </div>
            </div>

            <div className='flex flex-col gap-2'>
              {error && (
                <p className='text-[var(--text-error)] text-small leading-tight'>{error}</p>
              )}
              <div className='flex justify-end'>
                <Button
                  variant='primary'
                  onClick={onCreateOrganization}
                  disabled={!orgName || !orgSlug || isCreatingOrg}
                >
                  {isCreatingOrg ? '创建中...' : '创建团队工作区'}
                </Button>
              </div>
            </div>
          </div>
        </div>

        <ChipModal
          open={createOrgDialogOpen}
          onOpenChange={setCreateOrgDialogOpen}
          srTitle='创建团队组织'
        >
          <ChipModalHeader onClose={() => setCreateOrgDialogOpen(false)}>
            创建团队组织
          </ChipModalHeader>
          <ChipModalBody>
            {/* Hidden decoy field to prevent browser autofill */}
            <input
              type='text'
              name='fakeusernameremembered'
              autoComplete='username'
              style={{ position: 'absolute', left: '-9999px', opacity: 0, pointerEvents: 'none' }}
              tabIndex={-1}
              readOnly
              aria-hidden='true'
              aria-label='请忽略此字段'
            />
            <ChipModalField
              type='input'
              title='组织名称'
              value={orgName}
              onChange={(value) =>
                onOrgNameChange({ target: { value } } as React.ChangeEvent<HTMLInputElement>)
              }
              placeholder='输入组织名称'
              disabled={isCreatingOrg}
              autoComplete='off'
              required
            />
            <ChipModalField
              type='input'
              title='组织 Slug'
              value={orgSlug}
              onChange={setOrgSlug}
              placeholder='organization-slug'
              disabled={isCreatingOrg}
              autoComplete='off'
            />
            <ChipModalError>{error}</ChipModalError>
          </ChipModalBody>
          <ChipModalFooter
            onCancel={() => setCreateOrgDialogOpen(false)}
            cancelDisabled={isCreatingOrg}
            primaryAction={{
              label: isCreatingOrg ? '创建中...' : '创建组织',
              onClick: onCreateOrganization,
              disabled: isCreatingOrg || !orgName.trim(),
            }}
          />
        </ChipModal>
      </div>
    )
  }

  return (
    <div className='flex flex-col gap-5'>
      <div className='flex flex-col gap-2'>
        <h3 className='font-medium text-[var(--text-primary)] text-base'>没有团队工作区</h3>
        <p className='text-[var(--text-secondary)] text-small'>
          你还没有团队工作区。要与他人协作,请先升级到 Team 或 Enterprise 套餐。
        </p>
      </div>

      <div>
        <Button variant='primary' onClick={() => navigateToSettings({ section: 'billing' })}>
          升级到 Team 套餐
        </Button>
      </div>
    </div>
  )
}
