import type { components } from './schema'

type Schemas = components['schemas']

export type Category = Schemas['Category']
export type FieldError = Schemas['FieldError']
export type Item = Schemas['Item']
export type LoginRequest = Schemas['LoginRequest']
export type Problem = Schemas['Problem']
export type Review = Schemas['Review']
export type ReviewFacets = Schemas['ReviewFacets']
export type ReviewPage = Schemas['ReviewPageResponse']
export type ReviewUpdate = Schemas['PatchedReviewUpdateRequest']
export type SessionUser = Schemas['SessionUser']
export type Tag = Schemas['Tag']
