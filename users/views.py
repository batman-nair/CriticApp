from django.contrib.auth import get_user_model, logout
from django.shortcuts import redirect
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework import serializers, status
from rest_framework_simplejwt.tokens import RefreshToken

from .serializers import UserRegistrationSerializer

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
        },
    )
    def post(self, request):
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

