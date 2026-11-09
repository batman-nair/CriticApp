from django.conf import settings
from django.contrib.auth import authenticate, get_user_model, login, logout
from django.shortcuts import redirect
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie
from drf_spectacular.utils import OpenApiResponse, extend_schema, inline_serializer
from rest_framework.authentication import SessionAuthentication
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework import serializers, status
from rest_framework_simplejwt.tokens import RefreshToken

from critic.api.errors import PROBLEM_CONTENT_TYPE, ApiError, ProblemSerializer, problem_response
from critic.api.responses import api_response
from critic.api.schema import problem_responses, wrapped
from critic.api.views import V3APIView

from .serializers import (
    LoginDataSerializer,
    LoginSerializer,
    SessionDataSerializer,
    SessionUserSerializer,
    UserRegistrationSerializer,
)

User = get_user_model()


def logout_view(request):
    logout(request)
    return redirect('/')


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        summary='Get the current user',
        responses={
            200: inline_serializer('MeResponse', {
                'id': serializers.IntegerField(),
                'username': serializers.CharField(),
            }),
        },
    )
    def get(self, request):
        return Response({'id': request.user.id, 'username': request.user.username})


class RegisterView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(
        summary='Register a new user',
        request=UserRegistrationSerializer,
        responses={
            201: inline_serializer('RegisterResponse', {
                'refresh': serializers.CharField(),
                'access': serializers.CharField(),
            }),
            400: dict,
            (403, PROBLEM_CONTENT_TYPE): OpenApiResponse(ProblemSerializer, description='Registration is disabled'),
        },
    )
    def post(self, request):
        if not settings.REGISTRATION_ENABLED:
            return problem_response(403, 'REGISTRATION_DISABLED', 'Registration is disabled.')

        serializer = UserRegistrationSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data
        user = User.objects.create_user(
            username=data['username'],
            password=data['password'],
            email=data.get('email', ''),
        )
        refresh = RefreshToken.for_user(user)
        return Response(
            {'refresh': str(refresh), 'access': str(refresh.access_token)},
            status=status.HTTP_201_CREATED,
        )


class CsrfEnforcedAuthentication(SessionAuthentication):
    """Runs the CSRF check for anonymous requests too, and authenticates nobody.

    DRF views are csrf_exempt and SessionAuthentication checks CSRF only for a
    logged-in user, so an anonymous POST would otherwise go unchecked.
    Authentication runs before throttling, so a rejected request isn't counted.
    """

    def authenticate(self, request):
        self.enforce_csrf(request)
        return None


@method_decorator(ensure_csrf_cookie, name='dispatch')
class SessionCsrfView(V3APIView):
    authentication_classes = []
    permission_classes = []

    @extend_schema(
        tags=['auth'],
        operation_id='auth_csrf_retrieve',
        summary='Set the CSRF cookie',
        description='Sets the `csrftoken` cookie. Send its value as `X-CSRFToken` on writes.',
        auth=[],
        responses={204: None, **problem_responses()},
    )
    def get(self, request):
        return Response(status=status.HTTP_204_NO_CONTENT)


class SessionLoginView(V3APIView):
    authentication_classes = [CsrfEnforcedAuthentication]
    permission_classes = []
    throttle_scope = 'login'

    @extend_schema(
        tags=['auth'],
        operation_id='auth_login_create',
        summary='Log in',
        description='Starts a session. This also rotates the CSRF token, so read the cookie again afterwards.',
        auth=[],
        request=LoginSerializer,
        responses={200: wrapped(LoginDataSerializer), **problem_responses(400, 401, 403, 429)},
    )
    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = authenticate(request._request, **serializer.validated_data)
        if user is None:
            raise ApiError(401, 'INVALID_CREDENTIALS', 'Wrong username or password.')
        login(request._request, user)
        return api_response({'user': SessionUserSerializer(user).data})


class SessionLogoutView(V3APIView):
    # Not CsrfEnforcedAuthentication: when no authenticator returns a user,
    # DRF replaces request._request.user, and user_logged_out would lose it.
    # Without a session there's nothing to protect, so that case needs no token.
    authentication_classes = [SessionAuthentication]
    permission_classes = []

    @extend_schema(
        tags=['auth'],
        operation_id='auth_logout_create',
        summary='Log out',
        description='Ends the session on the server. Succeeds when there is no session too.',
        auth=[],
        request=None,
        responses={204: None, **problem_responses(403)},
    )
    def post(self, request):
        logout(request._request)
        return Response(status=status.HTTP_204_NO_CONTENT)


class SessionView(V3APIView):
    # No JWT, so a stale Authorization header can't turn this into a 401.
    authentication_classes = [SessionAuthentication]
    permission_classes = []

    @extend_schema(
        tags=['auth'],
        operation_id='auth_session_retrieve',
        summary='Get the session user',
        description='The logged-in user, or `user: null`. Never 401, so public pages can call it on load.',
        auth=[],
        responses={200: wrapped(SessionDataSerializer), **problem_responses()},
    )
    def get(self, request):
        user = request.user if request.user.is_authenticated else None
        return api_response({'user': SessionUserSerializer(user).data if user else None})

